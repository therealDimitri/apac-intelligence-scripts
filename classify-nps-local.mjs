#!/usr/bin/env node

/**
 * Batch NPS Classification — Local Transformers.js
 *
 * Classifies uncached NPS responses using local MobileBERT-MNLI inference
 * and stores results in nps_topic_classifications table.
 *
 * Usage:
 *   node scripts/classify-nps-local.mjs [--limit N] [--dry-run]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars
 */

import { createClient } from '@supabase/supabase-js'
import { pipeline } from '@huggingface/transformers'

// --- Config ---
const args = process.argv.slice(2)
const limit = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10) || 50
  : 50
const dryRun = args.includes('--dry-run')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- Topic Definitions (matches local-inference-nps.ts) ---

const TOPIC_DESCRIPTORS = {
  'Product & Features':
    'Software product functionality, features, roadmap, defects, bugs, enhancements, product quality assurance, innovation, capabilities',
  'User Experience':
    'User interface design, usability, navigation, workflow efficiency, ease of use, intuitive design, clunky interface, redundant steps',
  'Support & Service':
    'Customer support quality, helpdesk response time, ticket resolution, service desk, logging cases, snow case, dmr, issue escalation',
  'Account Management':
    'CSE relationship quality, account manager engagement, vendor representative, on-site visits, customer relations, willing to listen, approachable, personal relationship with account team',
  'Upgrade/Fix Delivery':
    'Software upgrade delivery, patch deployment, fix turnaround time, release schedule, delivery timeline, rollout planning',
  'Performance & Reliability':
    'System performance speed, uptime reliability, stability, downtime incidents, crashes, slow response, system lag, outages',
  'Training & Documentation':
    'Training sessions, documentation quality, user guides, knowledge base articles, learning resources, educational materials, tutorials',
  'Implementation & Onboarding':
    'System implementation, onboarding new users, go-live process, initial setup, integration with existing systems, deployment planning',
  'Value & Pricing':
    'Cost value proposition, pricing model, return on investment, licensing costs, contract value, expensive, affordable, worth the money',
  'Configuration & Customisation':
    'System configuration options, customisation flexibility, local requirements, tailored setup, configurable workflows, adaptable settings',
  'Collaboration & Partnership':
    'Strategic partnership quality, organisational collaboration, joint planning, receptive to feedback, fostering trust, working together as partners',
}

const KEYWORD_SIGNALS = {
  'Product & Features': [
    'product', 'feature', 'functionality', 'roadmap', 'enhancement',
    'capability', 'defect', 'qa', 'innovation', 'bug', 'module', 'opal', 'software',
  ],
  'User Experience': [
    'ui', 'ux', 'usability', 'navigation', 'workflow', 'interface',
    'ease of use', 'clunky', 'intuitive', 'user friendly', 'redundancy', 'redundant',
  ],
  'Support & Service': [
    'support', 'service', 'helpdesk', 'help desk', 'ticket', 'resolution',
    'customer service', 'snow case', 'dmr', 'issue resolution', 'escalation',
    'response time', 'responsive', 'assistance', 'logging',
  ],
  'Account Management': [
    'cse', 'account manager', 'account team', 'vendor', 'on-site', 'onsite',
    'engagement', 'relationship', 'representative', 'rep', 'willing to listen',
    'approachable', 'pleasant', 'easy to speak', 'customer relations',
  ],
  'Upgrade/Fix Delivery': [
    'upgrade', 'patch', 'fix', 'delivery', 'release', 'deployment',
    'turnaround', 'timeline', 'rollout', 'delayed', 'on schedule',
  ],
  'Performance & Reliability': [
    'performance', 'reliability', 'uptime', 'speed', 'stability',
    'downtime', 'crash', 'slow', 'fast', 'outage', 'lag', 'latency',
  ],
  'Training & Documentation': [
    'training', 'documentation', 'guide', 'tutorial', 'knowledge base',
    'education', 'learning', 'resources', 'webinar', 'course',
  ],
  'Implementation & Onboarding': [
    'implementation', 'onboarding', 'setup', 'integration', 'go-live',
    'rollout', 'deployment', 'initial', 'migration',
  ],
  'Value & Pricing': [
    'value', 'price', 'pricing', 'cost', 'roi', 'investment',
    'worth', 'expensive', 'affordable', 'contract', 'licensing',
  ],
  'Configuration & Customisation': [
    'configuration', 'config', 'customisation', 'customization',
    'local requirements', 'tailored', 'flexible', 'adaptable',
  ],
  'Collaboration & Partnership': [
    'collaboration', 'partnership', 'trust', 'receptive', 'feedback',
    'collaborative', 'partner', 'joint planning', 'strategic',
  ],
}

const NPS_TOPICS = Object.keys(TOPIC_DESCRIPTORS)
const DESCRIPTIVE_LABELS = NPS_TOPICS.map(t => TOPIC_DESCRIPTORS[t])

const MODEL_WEIGHT = 0.5
const KEYWORD_WEIGHT = 0.5

function computeKeywordScores(text) {
  const lower = text.toLowerCase()
  const scores = new Map()
  let maxHits = 0

  for (const topic of NPS_TOPICS) {
    const keywords = KEYWORD_SIGNALS[topic] || []
    let hits = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) hits++
    }
    scores.set(topic, hits)
    if (hits > maxHits) maxHits = hits
  }

  if (maxHits > 0) {
    for (const [topic, hits] of scores) {
      scores.set(topic, hits / maxHits)
    }
  }

  return scores
}

function getSentiment(score) {
  if (score >= 9) return 'positive'
  if (score >= 7) return 'neutral'
  return 'negative'
}

// --- Main ---

async function main() {
  console.log(`[Classify Local] Loading model...`)
  const classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', {
    dtype: 'q8',
    cache_dir: '.cache/transformers',
  })
  console.log(`[Classify Local] Model loaded`)

  // Fetch uncached NPS responses
  const { data: existingIds } = await supabase
    .from('nps_topic_classifications')
    .select('response_id')

  const cachedIds = new Set((existingIds || []).map(r => String(r.response_id)))

  const { data: responses, error } = await supabase
    .from('nps_responses')
    .select('id, feedback, score')
    .not('feedback', 'is', null)
    .neq('feedback', '')
    .neq('feedback', '.')
    .limit(limit + cachedIds.size) // over-fetch to compensate for filtering

  if (error) {
    console.error('[Classify Local] Failed to fetch responses:', error)
    process.exit(1)
  }

  const uncached = (responses || [])
    .filter(r => !cachedIds.has(String(r.id)))
    .slice(0, limit)

  console.log(`[Classify Local] ${uncached.length} uncached responses to classify (limit: ${limit})`)

  if (uncached.length === 0) {
    console.log('[Classify Local] Nothing to classify')
    return
  }

  const records = []

  for (const resp of uncached) {
    const result = await classifier(resp.feedback, DESCRIPTIVE_LABELS, { multi_label: true })

    // Map labels back to topic names
    const modelScores = new Map()
    for (let i = 0; i < result.labels.length; i++) {
      const idx = DESCRIPTIVE_LABELS.indexOf(result.labels[i])
      if (idx >= 0) modelScores.set(NPS_TOPICS[idx], result.scores[i])
    }

    const keywordScores = computeKeywordScores(resp.feedback)

    // Blend and pick top
    const blended = NPS_TOPICS.map(topic => ({
      topic,
      score: (modelScores.get(topic) || 0) * MODEL_WEIGHT + (keywordScores.get(topic) || 0) * KEYWORD_WEIGHT,
    })).sort((a, b) => b.score - a.score)

    const sentiment = getSentiment(resp.score)
    const primary = blended[0]

    records.push({
      response_id: String(resp.id),
      topic_name: primary.topic,
      sentiment,
      confidence_score: Math.round(primary.score * 100) / 100,
      insight: '[PRIMARY]',
      model_version: 'mobilebert-uncased-mnli',
      classified_at: new Date().toISOString(),
    })

    // Include secondary topics above threshold
    for (let i = 1; i < blended.length && blended[i].score >= 0.35; i++) {
      records.push({
        response_id: String(resp.id),
        topic_name: blended[i].topic,
        sentiment,
        confidence_score: Math.round(blended[i].score * 100) / 100,
        insight: '',
        model_version: 'mobilebert-uncased-mnli',
        classified_at: new Date().toISOString(),
      })
    }
  }

  console.log(`[Classify Local] Generated ${records.length} classification records`)

  if (dryRun) {
    console.log('[Classify Local] DRY RUN — not writing to database')
    for (const r of records.slice(0, 10)) {
      console.log(`  ${r.response_id}: ${r.topic_name} (${r.confidence_score}) ${r.insight}`)
    }
    return
  }

  const { error: insertError } = await supabase
    .from('nps_topic_classifications')
    .upsert(records, { onConflict: 'response_id,topic_name', ignoreDuplicates: false })

  if (insertError) {
    console.error('[Classify Local] Failed to store:', insertError)
    process.exit(1)
  }

  console.log(`[Classify Local] Stored ${records.length} classifications`)
}

main().catch(err => {
  console.error('[Classify Local] Fatal:', err)
  process.exit(1)
})
