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
 */
async function classifyBatch(comments) {
  const systemPrompt = `You are an expert NPS feedback topic classification system for Altera Digital Health's APAC Client Success team.

**YOUR TASK:**
Classify each NPS comment into EXACTLY ONE primary topic and assign sentiment.

**AVAILABLE TOPICS:**
1. **Product & Features** - Core product functionality, features, system capabilities, innovation, product development
2. **Support & Service** - Customer support quality, service responsiveness, help desk, ticket resolution
3. **Training & Documentation** - Learning resources, guides, tutorials, knowledge base, education
4. **Implementation & Onboarding** - Setup, integration, deployment, rollout, go-live
5. **Performance & Reliability** - Speed, uptime, stability, bugs, crashes, downtime
6. **Value & Pricing** - Cost, ROI, value perception, pricing concerns, investment
7. **User Experience** - UI/UX, usability, interface design, ease of use, workflow

**CLASSIFICATION RULES:**
1. **Single Topic Assignment:** Assign ONLY ONE primary topic per comment
2. **Dominant Theme:** If a comment mentions multiple topics, choose the one with the STRONGEST emphasis
3. **Sentiment Analysis:** Consider BOTH the NPS score AND the language used
4. **Topic Insight:** Extract a brief, specific insight (1 sentence, max 100 characters)

**RESPONSE FORMAT:**
Return a JSON array with one object per comment:

[
  {
    "id": "comment_id",
    "primary_topic": "Product & Features",
    "sentiment": "negative",
    "topic_insight": "Concerns about product defects in QA process",
    "confidence": 85
  }
]

**CRITICAL:**
- DO assign each comment to EXACTLY ONE topic
- DO return valid JSON array format (no markdown code blocks)
- DO provide specific topic insights`

  const userPrompt = `Classify these ${comments.length} NPS comments. Return ONLY the JSON array, no markdown code blocks, no explanations.

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

    // Validate each classification
    classifications.forEach((c, index) => {
      if (!c.id || !c.primary_topic || !c.sentiment || !c.topic_insight) {
        throw new Error(`Classification ${index} missing required fields`)
      }
    })

  } catch (parseError) {
    throw new Error(`Failed to parse AI response: ${parseError.message}`)
  }

  return classifications
}

/**
 * Store classifications in nps_topic_classifications table
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

  // Convert classifications to database format
  const records = classifications.map(c => ({
    response_id: String(c.id),
    topic_name: c.primary_topic,
    sentiment: normalizeSentiment(c.sentiment),
    confidence_score: c.confidence / 100, // Convert percentage to decimal
    insight: c.topic_insight,
    model_version: 'claude-sonnet-4',
    classified_at: new Date().toISOString()
  }))

  // Insert records (ON CONFLICT DO NOTHING to handle duplicates gracefully)
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
    console.log(`Successfully Classified: ${totalSuccessful}`)
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
