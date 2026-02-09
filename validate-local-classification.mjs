#!/usr/bin/env node

/**
 * Validate Local Classification Accuracy
 *
 * Compares local MobileBERT-MNLI classifications against existing
 * Claude-generated ground truth in nps_topic_classifications table.
 *
 * Usage:
 *   node scripts/validate-local-classification.mjs [--limit N]
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- Topic Definitions (mirrors local-inference-nps.ts) ---

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
  console.log('[Validate] Loading model...')
  const classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', {
    dtype: 'q8',
    cache_dir: '.cache/transformers',
  })
  console.log('[Validate] Model loaded')

  // Fetch existing Claude classifications (ground truth)
  const { data: classifications, error: classError } = await supabase
    .from('nps_topic_classifications')
    .select('response_id, topic_name, sentiment')
    .eq('model_version', 'claude-sonnet-4-multi')
    .not('topic_name', 'is', null)
    .limit(limit * 3)

  if (classError) {
    console.error('[Validate] Failed to fetch classifications:', classError)
    process.exit(1)
  }

  // Group by response_id — pick primary topic (first one)
  const groundTruth = new Map()
  for (const c of classifications || []) {
    if (!groundTruth.has(c.response_id)) {
      groundTruth.set(c.response_id, {
        topic: c.topic_name,
        sentiment: c.sentiment,
        allTopics: [c.topic_name],
      })
    } else {
      groundTruth.get(c.response_id).allTopics.push(c.topic_name)
    }
  }

  const responseIds = [...groundTruth.keys()].slice(0, limit)

  // Fetch NPS responses for those IDs
  const { data: responses, error: fetchError } = await supabase
    .from('nps_responses')
    .select('id, feedback, score')
    .in('id', responseIds.map(Number).filter(n => !isNaN(n)))

  if (fetchError) {
    console.error('[Validate] Failed to fetch responses:', fetchError)
    process.exit(1)
  }

  console.log(`[Validate] Comparing ${responses.length} responses`)

  let exactMatch = 0
  let top3Match = 0
  let sentimentMatch = 0
  let total = 0

  for (const resp of responses || []) {
    const truth = groundTruth.get(String(resp.id))
    if (!truth || !resp.feedback) continue

    // Run local classifier
    const result = await classifier(resp.feedback, DESCRIPTIVE_LABELS, { multi_label: true })

    // Map labels → topics with blended scores
    const modelScores = new Map()
    for (let i = 0; i < result.labels.length; i++) {
      const idx = DESCRIPTIVE_LABELS.indexOf(result.labels[i])
      if (idx >= 0) modelScores.set(NPS_TOPICS[idx], result.scores[i])
    }

    const keywordScores = computeKeywordScores(resp.feedback)

    const blended = NPS_TOPICS.map(topic => ({
      topic,
      score: (modelScores.get(topic) || 0) * MODEL_WEIGHT + (keywordScores.get(topic) || 0) * KEYWORD_WEIGHT,
    })).sort((a, b) => b.score - a.score)

    const predicted = blended[0].topic
    const top3 = blended.slice(0, 3).map(b => b.topic)
    const predictedSentiment = getSentiment(resp.score)

    total++

    if (predicted === truth.topic) exactMatch++
    if (top3.includes(truth.topic)) top3Match++
    if (predictedSentiment === truth.sentiment) sentimentMatch++
  }

  console.log('\n--- Validation Results ---')
  console.log(`Total compared: ${total}`)
  console.log(`Exact topic match: ${exactMatch}/${total} (${total ? Math.round(exactMatch / total * 100) : 0}%)`)
  console.log(`Top-3 topic match: ${top3Match}/${total} (${total ? Math.round(top3Match / total * 100) : 0}%)`)
  console.log(`Sentiment match:   ${sentimentMatch}/${total} (${total ? Math.round(sentimentMatch / total * 100) : 0}%)`)
  console.log(`\nTargets: exact >=75%, top-3 >=90%`)
}

main().catch(err => {
  console.error('[Validate] Fatal:', err)
  process.exit(1)
})
