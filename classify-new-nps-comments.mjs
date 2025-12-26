#!/usr/bin/env node
/**
 * Background Job: Classify New NPS Comments
 *
 * Purpose: Progressively populate nps_topic_classifications table with AI classifications
 * for NPS responses that don't have cached classifications yet.
 *
 * Strategy:
 * 1. Query nps_responses for responses without cached classifications
 * 2. Batch classify using Claude Sonnet 4 via MatchaAI (5-10 at a time)
 * 3. Store results in nps_topic_classifications table
 * 4. Log progress and statistics
 *
 * Usage:
 *   node scripts/classify-new-nps-comments.mjs [--limit N] [--batch-size N] [--dry-run]
 *
 * Options:
 *   --limit N         Process at most N uncached responses (default: all)
 *   --batch-size N    Classify N responses per batch (default: 5, max: 10)
 *   --dry-run         Query and display uncached responses without classifying
 *
 * Created: 2025-12-01
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`)
  return index !== -1 && args[index + 1] ? parseInt(args[index + 1]) : defaultValue
}
const isDryRun = args.includes('--dry-run')
const limit = getArg('limit', null)
const batchSize = Math.min(getArg('batch-size', 5), 10) // Max 10 per batch

// MatchaAI Configuration
const MATCHAAI_CONFIG = {
  apiKey: process.env.MATCHAAI_API_KEY,
  baseUrl: process.env.MATCHAAI_BASE_URL || 'https://matcha.harriscomputer.com/rest/api/v1',
  missionId: process.env.MATCHAAI_MISSION_ID || '1397',
}

// Supabase client with service role key (admin access)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('🤖 NPS COMMENT CLASSIFICATION BACKGROUND JOB\n')
console.log('='.repeat(70))
console.log()
console.log('Configuration:')
console.log(`  Batch Size: ${batchSize} responses per batch`)
console.log(`  Limit: ${limit ? `${limit} responses` : 'All uncached responses'}`)
console.log(`  Mode: ${isDryRun ? '🔍 DRY RUN (no classification)' : '🚀 LIVE CLASSIFICATION'}`)
console.log()
console.log('='.repeat(70))
console.log()

/**
 * Query for NPS responses without cached classifications
 */
async function getUncachedResponses(limitCount = null) {
  console.log('📊 Step 1: Querying for uncached NPS responses...\n')

  // Step 1: Get all response IDs with feedback
  let query = supabase
    .from('nps_responses')
    .select('id, feedback, score, response_date, client_name')
    .not('feedback', 'is', null)
    .neq('feedback', '')
    .neq('feedback', '.')
    .order('response_date', { ascending: false })

  if (limitCount) {
    query = query.limit(limitCount * 2) // Get extra to account for already-cached
  }

  const { data: allResponses, error: responseError } = await query

  if (responseError) {
    throw new Error(`Failed to query responses: ${responseError.message}`)
  }

  console.log(`  Found ${allResponses.length} total responses with feedback`)

  // Step 2: Get all cached response IDs
  const { data: cachedClassifications, error: cacheError } = await supabase
    .from('nps_topic_classifications')
    .select('response_id')

  if (cacheError) {
    throw new Error(`Failed to query cached classifications: ${cacheError.message}`)
  }

  const cachedIds = new Set(cachedClassifications.map(c => c.response_id))
  console.log(`  Found ${cachedIds.size} cached classifications`)

  // Step 3: Filter to uncached responses
  const uncachedResponses = allResponses.filter(r => !cachedIds.has(String(r.id)))

  // Apply limit if specified
  const responses = limitCount
    ? uncachedResponses.slice(0, limitCount)
    : uncachedResponses

  console.log(`✅ Found ${responses.length} uncached NPS responses\n`)

  if (responses.length > 0) {
    console.log('Sample responses:')
    responses.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ID: ${r.id}, Score: ${r.score}, Client: ${r.client_name}`)
      console.log(`     Feedback: "${r.feedback.substring(0, 80)}${r.feedback.length > 80 ? '...' : ''}"`)
    })
    console.log()
  }

  return responses
}

/**
 * Classify a batch of comments using Claude Sonnet 4 via MatchaAI
 * UPDATED: Now uses multi-topic classification (extracts ALL topics per comment)
 */
async function classifyBatch(comments) {
  const systemPrompt = `You are an expert NPS feedback topic classification system for Altera Digital Health's APAC Client Success team.

**YOUR TASK:**
Extract ALL relevant topics from each NPS comment with per-topic sentiment. A single comment often contains multiple distinct topics with different sentiments.

**AVAILABLE TOPICS (11 categories):**
1. **Product & Features** - Core product functionality, system capabilities, features, innovation, product quality, defects, QA
2. **User Experience** - UI/UX, usability, navigation, workflow efficiency, interface design, ease of use, clunkiness, redundancy
3. **Support & Service** - Help desk quality, ticket resolution, service responsiveness, customer service, issue resolution time
4. **Account Management** - Relationship with CSE/account team, vendor engagement, on-site visits, communication quality, trust
5. **Upgrade/Fix Delivery** - Patch delivery timelines, upgrade processes, fix turnaround time, release quality, deployment delays
6. **Performance & Reliability** - Speed, uptime, stability, bugs, crashes, downtime, system performance
7. **Training & Documentation** - Learning resources, guides, tutorials, knowledge base, education, training quality
8. **Implementation & Onboarding** - Setup, integration, deployment, rollout, go-live, initial implementation
9. **Value & Pricing** - Cost, ROI, value perception, pricing concerns, investment, value for money
10. **Configuration & Customisation** - Client-specific setup, config limitations, customisation options, local requirements
11. **Collaboration & Partnership** - Trust building, flexibility, collaborative approach, receptiveness to feedback, partnership quality

**CLASSIFICATION RULES:**
1. **Multi-Topic Extraction:** Extract ALL topics mentioned in the comment, not just one
2. **Per-Topic Sentiment:** Each topic gets its own sentiment based on what's said about THAT topic specifically:
   - "positive" = praise, satisfaction, gratitude for this topic
   - "negative" = complaints, frustration, criticism for this topic
   - "neutral" = factual mention without clear positive/negative tone
3. **Excerpt Required:** Include a brief quote/paraphrase (max 80 chars) showing WHY this topic was identified
4. **Primary Topic:** Identify which topic has the STRONGEST emphasis (most text, strongest language)
5. **Overall Sentiment:**
   - "positive" = mostly positive topics
   - "negative" = mostly negative topics
   - "neutral" = balanced or factual
   - "mixed" = significant positive AND negative topics present

**RESPONSE FORMAT:**
Return a JSON array with one object per comment:

[
  {
    "id": "comment_id",
    "classifications": [
      { "topic": "User Experience", "sentiment": "negative", "excerpt": "outdated and clunky to navigate" },
      { "topic": "Support & Service", "sentiment": "negative", "excerpt": "difficult to get customer service to respond" },
      { "topic": "Account Management", "sentiment": "positive", "excerpt": "reps on-site have been pleasant and helpful" }
    ],
    "primary_topic": "User Experience",
    "primary_sentiment": "negative",
    "overall_sentiment": "mixed",
    "confidence": 92
  }
]

**CRITICAL:**
- DO extract ALL relevant topics (typically 1-4 per comment)
- DO assign sentiment PER TOPIC based on what's said about that topic
- DO include brief excerpts showing evidence for each topic
- DO identify the primary (most emphasised) topic
- DO NOT miss topics that are clearly mentioned
- DO return valid JSON array format (no markdown code blocks)`

  const userPrompt = `Classify these ${comments.length} NPS comments using multi-topic extraction. Return ONLY the JSON array, no markdown code blocks, no explanations.

${comments.map((c, i) => `${i + 1}. ID: ${c.id}, Score: ${c.score}/10
   Comment: "${c.feedback}"`).join('\n\n')}`

  // Call MatchaAI API with Claude Sonnet 4
  const response = await fetch(`${MATCHAAI_CONFIG.baseUrl}/completions`, {
    method: 'POST',
    headers: {
      'MATCHA-API-KEY': MATCHAAI_CONFIG.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mission_id: parseInt(MATCHAAI_CONFIG.missionId),
      llm_id: 28,  // Claude Sonnet 4
      input: `${systemPrompt}\n\n${userPrompt}`
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`MatchaAI API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  // Extract AI response text
  let aiText = data.output[0].content[0].text

  // Clean up markdown code blocks if present
  aiText = aiText.replace(/^```(?:json)?\s*/i, '')
  aiText = aiText.replace(/```[\s\S]*$/i, '')
  aiText = aiText.trim()

  // Parse JSON response
  let classifications
  try {
    classifications = JSON.parse(aiText)

    if (!Array.isArray(classifications)) {
      throw new Error('Response is not an array')
    }

    // Validate each classification (new multi-topic format)
    classifications.forEach((c, index) => {
      if (!c.id || !c.primary_topic || !c.classifications || !Array.isArray(c.classifications)) {
        throw new Error(`Classification ${index} missing required fields (id, primary_topic, classifications array)`)
      }
      // Validate each topic within the classifications array
      c.classifications.forEach((tc, tcIndex) => {
        if (!tc.topic || !tc.sentiment || !tc.excerpt) {
          throw new Error(`Classification ${index}, topic ${tcIndex} missing required fields (topic, sentiment, excerpt)`)
        }
      })
    })

  } catch (parseError) {
    throw new Error(`Failed to parse AI response: ${parseError.message}`)
  }

  return classifications
}

/**
 * Store classifications in nps_topic_classifications table
 * UPDATED: Now handles multi-topic format - creates one record per topic per response
 */
async function storeClassifications(classifications) {
  // Normalize sentiment values to match database constraint
  const normalizeSentiment = (sentiment) => {
    const normalized = sentiment.toLowerCase().trim()
    // Map to valid values: 'positive', 'negative', 'neutral', 'mixed'
    if (['positive', 'negative', 'neutral', 'mixed'].includes(normalized)) {
      return normalized
    }
    // Default to neutral if invalid
    console.warn(`  ⚠️  Invalid sentiment "${sentiment}", defaulting to "neutral"`)
    return 'neutral'
  }

  // Flatten multi-topic classifications into individual database records
  // Each comment may have 1-4 topics, each gets its own record
  const records = []
  const classifiedAt = new Date().toISOString()

  for (const c of classifications) {
    const responseId = String(c.id)
    const confidence = (c.confidence || 85) / 100 // Convert percentage to decimal

    // Track seen topics to avoid duplicates (AI sometimes returns same topic twice)
    const seenTopics = new Set()

    // Create a record for each topic extracted from this comment
    for (const tc of c.classifications) {
      // Skip duplicate topics for same response
      const key = `${responseId}:${tc.topic}`
      if (seenTopics.has(key)) {
        console.log(`  ⚠️  Skipping duplicate topic "${tc.topic}" for response ${responseId}`)
        continue
      }
      seenTopics.add(key)

      const isPrimary = tc.topic === c.primary_topic

      // Build insight with context about primary topic and overall sentiment
      const insightParts = [tc.excerpt]
      if (isPrimary) insightParts.push('[PRIMARY]')
      if (c.overall_sentiment === 'mixed') insightParts.push('[MIXED OVERALL]')

      records.push({
        response_id: responseId,
        topic_name: tc.topic,
        sentiment: normalizeSentiment(tc.sentiment),
        confidence_score: isPrimary ? confidence : confidence * 0.9, // Slightly lower confidence for secondary topics
        insight: insightParts.join(' '),
        model_version: 'claude-sonnet-4-multi',
        classified_at: classifiedAt
      })
    }
  }

  console.log(`  📊 Flattened ${classifications.length} comments → ${records.length} topic records`)

  // Insert records (ON CONFLICT updates to handle re-classifications)
  const { data, error } = await supabase
    .from('nps_topic_classifications')
    .upsert(records, {
      onConflict: 'response_id,topic_name',
      ignoreDuplicates: false
    })

  if (error) {
    throw new Error(`Failed to store classifications: ${error.message}`)
  }

  return records.length
}

/**
 * Main classification job
 */
async function runClassificationJob() {
  const startTime = Date.now()
  let totalProcessed = 0
  let totalSuccessful = 0
  let totalErrors = 0

  try {
    // Step 1: Get uncached responses
    const uncachedResponses = await getUncachedResponses(limit)

    if (uncachedResponses.length === 0) {
      console.log('✅ No uncached responses found. All responses are already classified!\n')
      return
    }

    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: Would classify these responses\n')
      console.log('='.repeat(70))
      console.log()
      return
    }

    // Step 2: Process in batches
    console.log(`🚀 Step 2: Classifying ${uncachedResponses.length} responses in batches of ${batchSize}...\n`)

    const batches = []
    for (let i = 0; i < uncachedResponses.length; i += batchSize) {
      batches.push(uncachedResponses.slice(i, i + batchSize))
    }

    console.log(`📦 Total batches: ${batches.length}\n`)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const batchNumber = i + 1

      console.log(`Batch ${batchNumber}/${batches.length} (${batch.length} responses):`)
      console.log(`  Response IDs: ${batch.map(r => r.id).join(', ')}`)

      try {
        // Classify batch
        console.log(`  📤 Calling MatchaAI for classification...`)
        const classifications = await classifyBatch(batch)
        console.log(`  ✅ Received ${classifications.length} classifications`)

        // Store in database
        console.log(`  💾 Storing classifications in database...`)
        const storedCount = await storeClassifications(classifications)
        console.log(`  ✅ Stored ${storedCount} classifications`)

        totalProcessed += batch.length
        totalSuccessful += storedCount

        // Brief pause between batches to respect rate limits
        if (batchNumber < batches.length) {
          console.log(`  ⏸️  Pausing 2 seconds before next batch...\n`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
          console.log()
        }

      } catch (error) {
        console.error(`  ❌ Batch ${batchNumber} failed: ${error.message}`)
        totalErrors += batch.length
        console.log()
      }
    }

    // Step 3: Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('='.repeat(70))
    console.log()
    console.log('📊 CLASSIFICATION JOB SUMMARY\n')
    console.log(`Total Responses Processed: ${totalProcessed}`)
    console.log(`Total Topic Records Stored: ${totalSuccessful}`)
    console.log(`Average Topics per Response: ${totalProcessed > 0 ? (totalSuccessful / totalProcessed).toFixed(1) : 0}`)
    console.log(`Errors: ${totalErrors}`)
    console.log(`Duration: ${duration}s`)
    console.log(`Average: ${totalProcessed > 0 ? (duration / totalProcessed).toFixed(2) : 0}s per response`)
    console.log()

    // Step 4: Verify cache hit rate improvement
    console.log('🔍 Step 3: Checking cache hit rate improvement...\n')

    const { data: totalResponses, error: totalError } = await supabase
      .from('nps_responses')
      .select('id', { count: 'exact', head: true })
      .not('feedback', 'is', null)
      .neq('feedback', '')
      .neq('feedback', '.')

    const { data: cachedResponses, error: cachedError } = await supabase
      .from('nps_topic_classifications')
      .select('response_id', { count: 'exact', head: true })

    if (!totalError && !cachedError) {
      const totalCount = totalResponses?.count || 0
      const cachedCount = cachedResponses?.count || 0
      const cacheHitRate = totalCount > 0 ? (cachedCount / totalCount * 100).toFixed(1) : 0

      console.log(`Total NPS Responses (with feedback): ${totalCount}`)
      console.log(`Cached Classifications: ${cachedCount}`)
      console.log(`Cache Hit Rate: ${cacheHitRate}%`)
      console.log()

      if (cacheHitRate >= 80) {
        console.log('🎉 Cache hit rate ≥80%! AI classifications will be used for instant display.')
      } else {
        console.log('⚠️  Cache hit rate <80%. Keyword fallback will be used until more responses are classified.')
        console.log(`   Need to classify ${Math.ceil((totalCount * 0.8) - cachedCount)} more responses to reach 80% threshold.`)
      }
      console.log()
    }

    console.log('='.repeat(70))
    console.log()
    console.log('✅ CLASSIFICATION JOB COMPLETE\n')

  } catch (error) {
    console.error('\n❌ CLASSIFICATION JOB FAILED\n')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    console.log()
    process.exit(1)
  }
}

// Validate MatchaAI configuration
if (!MATCHAAI_CONFIG.apiKey) {
  console.error('❌ ERROR: MATCHAAI_API_KEY not configured in .env.local\n')
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Supabase credentials not configured in .env.local\n')
  process.exit(1)
}

// Run the job
runClassificationJob()
