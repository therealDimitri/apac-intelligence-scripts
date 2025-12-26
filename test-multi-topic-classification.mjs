#!/usr/bin/env node
/**
 * Test Multi-Topic Classification
 *
 * Tests the new multi-topic classification system with real example comments
 * to verify it correctly extracts multiple topics with per-topic sentiment.
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// MatchaAI Configuration
const MATCHAAI_CONFIG = {
  apiKey: process.env.MATCHAAI_API_KEY,
  baseUrl: process.env.MATCHAAI_BASE_URL || 'https://matcha.harriscomputer.com/rest/api/v1',
  missionId: process.env.MATCHAAI_MISSION_ID || '1397',
}

// Test comments provided by user
const testComments = [
  {
    id: 'test-1',
    score: 5,
    feedback: `Altera seems a bit outdated compared to other EHRs and is very clunky to navigate. There is a lot of redundancy in the EHR and the different parts of Altera Sunrise do not flow together very well. It is also very difficult to get customer service and our reps to respond and resolve issues in a timely matter. Some issues have taken 6+ mo to resolve in the recent past. I have definitely used worse EHRs, so this one is still possible to navigate. The reps that I have met for on-site visits have also been very pleasant and helpful, which is nice to know there are some staff in the company that are easy to speak with.`,
    expected: [
      { topic: 'User Experience', sentiment: 'negative' },
      { topic: 'Support & Service', sentiment: 'negative' },
      { topic: 'Account Management', sentiment: 'positive' }
    ]
  },
  {
    id: 'test-2',
    score: 7,
    feedback: `Altera Digital Health provide flexible solutions and when issues arise they are receptive to feedback, don't dismiss the responsibility and look to collaborate and resolve issues while fostering trust. The team have matured over time. The product continues to have a number of issues however support is improving and these issues are commonly shared through collaborative approaches and understanding.`,
    expected: [
      { topic: 'Collaboration & Partnership', sentiment: 'positive' },
      { topic: 'Account Management', sentiment: 'positive' },
      { topic: 'Product & Features', sentiment: 'negative' },
      { topic: 'Support & Service', sentiment: 'positive' }
    ]
  },
  {
    id: 'test-3',
    score: 8,
    feedback: `I appreciate the engagement we have directly with the vendor, and I think the biggest limitations in the product are due to our config.`,
    expected: [
      { topic: 'Account Management', sentiment: 'positive' },
      { topic: 'Configuration & Customisation', sentiment: 'negative' }
    ]
  },
  {
    id: 'test-4',
    score: 3,
    feedback: `Delivery challenges/failures`,
    expected: [
      { topic: 'Upgrade/Fix Delivery', sentiment: 'negative' }
    ]
  }
]

console.log('🧪 MULTI-TOPIC CLASSIFICATION TEST\n')
console.log('='.repeat(70))
console.log()
console.log(`Testing ${testComments.length} example comments with expected multi-topic classification\n`)

// Build the classification prompt (same as in API/script)
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

const userPrompt = `Classify these ${testComments.length} NPS comments using multi-topic extraction. Return ONLY the JSON array, no markdown code blocks, no explanations.

${testComments.map((c, i) => `${i + 1}. ID: ${c.id}, Score: ${c.score}/10
   Comment: "${c.feedback}"`).join('\n\n')}`

async function runTest() {
  try {
    console.log('📤 Calling MatchaAI with Claude Sonnet 4...\n')

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
    const classifications = JSON.parse(aiText)

    console.log('✅ Received classifications:\n')
    console.log('='.repeat(70))

    // Display results and compare to expected
    for (const result of classifications) {
      const testCase = testComments.find(t => t.id === result.id)

      console.log(`\n📝 ${result.id} (Score: ${testCase?.score}/10)`)
      console.log(`   Feedback: "${testCase?.feedback.substring(0, 100)}..."`)
      console.log()
      console.log('   🏷️  EXTRACTED TOPICS:')

      for (const tc of result.classifications) {
        const sentimentIcon = tc.sentiment === 'positive' ? '✅' : tc.sentiment === 'negative' ? '❌' : '➖'
        const isPrimary = tc.topic === result.primary_topic ? ' [PRIMARY]' : ''
        console.log(`      ${sentimentIcon} ${tc.topic} (${tc.sentiment})${isPrimary}`)
        console.log(`         "${tc.excerpt}"`)
      }

      console.log()
      console.log(`   📊 Overall: ${result.overall_sentiment} | Confidence: ${result.confidence}%`)

      // Compare with expected
      if (testCase?.expected) {
        console.log()
        console.log('   📋 EXPECTED TOPICS:')
        for (const exp of testCase.expected) {
          const found = result.classifications.find(c =>
            c.topic === exp.topic && c.sentiment === exp.sentiment
          )
          const icon = found ? '✅' : '❌'
          console.log(`      ${icon} ${exp.topic} (${exp.sentiment}) - ${found ? 'MATCHED' : 'MISSING'}`)
        }
      }

      console.log()
      console.log('-'.repeat(70))
    }

    // Summary
    console.log()
    console.log('='.repeat(70))
    console.log()
    console.log('📊 TEST SUMMARY\n')

    let totalExpected = 0
    let totalMatched = 0

    for (const result of classifications) {
      const testCase = testComments.find(t => t.id === result.id)
      if (testCase?.expected) {
        for (const exp of testCase.expected) {
          totalExpected++
          const found = result.classifications.find(c =>
            c.topic === exp.topic && c.sentiment === exp.sentiment
          )
          if (found) totalMatched++
        }
      }
    }

    const accuracy = totalExpected > 0 ? ((totalMatched / totalExpected) * 100).toFixed(1) : 0
    console.log(`Expected Topics: ${totalExpected}`)
    console.log(`Matched Topics: ${totalMatched}`)
    console.log(`Accuracy: ${accuracy}%`)
    console.log()

    const totalExtracted = classifications.reduce((sum, c) => sum + c.classifications.length, 0)
    console.log(`Total Topics Extracted: ${totalExtracted}`)
    console.log(`Average Topics per Comment: ${(totalExtracted / classifications.length).toFixed(1)}`)
    console.log()

    console.log('✅ MULTI-TOPIC CLASSIFICATION TEST COMPLETE\n')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Validate configuration
if (!MATCHAAI_CONFIG.apiKey) {
  console.error('❌ ERROR: MATCHAAI_API_KEY not configured in .env.local\n')
  process.exit(1)
}

// Run the test
runTest()
