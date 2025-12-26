#!/usr/bin/env node

/**
 * Debug Script: AI Workflow Failure Investigation
 *
 * Tests each component of the workflow pipeline to identify failures:
 * 1. MatchaAI API connectivity and authentication
 * 2. Supabase database connectivity
 * 3. Semantic search functionality
 * 4. Embedding generation
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const MATCHAAI_CONFIG = {
  apiKey: process.env.MATCHAAI_API_KEY || '',
  baseUrl: process.env.MATCHAAI_BASE_URL || 'https://matcha.harriscomputer.com/rest/api/v1',
  missionId: process.env.MATCHAAI_MISSION_ID || '1397',
}

const SUPABASE_CONFIG = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

console.log('=' .repeat(60))
console.log('AI WORKFLOW FAILURE DIAGNOSTIC')
console.log('=' .repeat(60))
console.log('')

// Test 1: Environment Variables
console.log('TEST 1: Environment Variables')
console.log('-'.repeat(40))
const envTests = [
  { name: 'MATCHAAI_API_KEY', value: MATCHAAI_CONFIG.apiKey, required: true },
  { name: 'MATCHAAI_BASE_URL', value: MATCHAAI_CONFIG.baseUrl, required: true },
  { name: 'MATCHAAI_MISSION_ID', value: MATCHAAI_CONFIG.missionId, required: true },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', value: SUPABASE_CONFIG.url, required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: SUPABASE_CONFIG.serviceKey, required: true },
  { name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY, required: false },
  { name: 'ANTHROPIC_API_KEY', value: process.env.ANTHROPIC_API_KEY, required: false },
]

let envOk = true
for (const test of envTests) {
  const status = test.value ? '✓' : (test.required ? '✗' : '○')
  const preview = test.value ? `${test.value.substring(0, 8)}...` : 'NOT SET'
  console.log(`  ${status} ${test.name}: ${preview}`)
  if (test.required && !test.value) envOk = false
}
console.log('')

if (!envOk) {
  console.log('❌ CRITICAL: Required environment variables missing!')
  console.log('   Workflow will fail without proper configuration.')
  console.log('')
}

// Test 2: MatchaAI API Connectivity
console.log('TEST 2: MatchaAI API Connectivity')
console.log('-'.repeat(40))

async function testMatchaAI() {
  if (!MATCHAAI_CONFIG.apiKey) {
    console.log('  ⚠ Skipping - API key not configured')
    return false
  }

  const testUrl = `${MATCHAAI_CONFIG.baseUrl}/completions`
  console.log(`  Testing: ${testUrl}`)

  try {
    // First, test if the endpoint is reachable
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'MATCHA-API-KEY': MATCHAAI_CONFIG.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mission_id: parseInt(MATCHAAI_CONFIG.missionId),
        llm_id: 28, // Claude Sonnet 4
        messages: [
          { role: 'user', content: 'Say "test successful" and nothing else.' }
        ],
        max_tokens: 50,
        temperature: 0,
      }),
    })

    const contentType = response.headers.get('content-type') || ''
    console.log(`  Response status: ${response.status} ${response.statusText}`)
    console.log(`  Content-Type: ${contentType}`)

    const responseText = await response.text()

    // Check if we got HTML instead of JSON
    if (responseText.trim().startsWith('<')) {
      console.log('  ❌ CRITICAL: Received HTML instead of JSON!')
      console.log('  Response preview:', responseText.substring(0, 200))
      console.log('')
      console.log('  DIAGNOSIS: The MatchaAI API is returning an HTML page.')
      console.log('  Possible causes:')
      console.log('    - Invalid API key')
      console.log('    - API endpoint changed')
      console.log('    - Authentication/session expired')
      console.log('    - Network proxy intercepting requests')
      console.log('    - API service is down')
      return false
    }

    if (!response.ok) {
      console.log(`  ❌ API Error: ${response.status}`)
      console.log('  Response:', responseText.substring(0, 500))
      return false
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText)
      console.log('  ✓ Response is valid JSON')
      console.log('  Status:', data.status)

      const outputText = data.output?.[0]?.content?.[0]?.text ||
                         data.output?.[0]?.message?.content ||
                         data.choices?.[0]?.message?.content ||
                         data.response ||
                         'NO OUTPUT FOUND'
      console.log('  Output:', outputText.substring(0, 100))

      if (outputText === 'NO OUTPUT FOUND') {
        console.log('  ⚠ Warning: Response structure unexpected')
        console.log('  Full response:', JSON.stringify(data, null, 2).substring(0, 500))
        return false
      }

      return true
    } catch (parseError) {
      console.log('  ❌ Failed to parse response as JSON')
      console.log('  Response:', responseText.substring(0, 300))
      return false
    }

  } catch (error) {
    console.log(`  ❌ Network error: ${error.message}`)
    return false
  }
}

const matchaOk = await testMatchaAI()
console.log('')

// Test 3: Supabase Connectivity
console.log('TEST 3: Supabase Connectivity')
console.log('-'.repeat(40))

async function testSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.serviceKey) {
    console.log('  ⚠ Skipping - Supabase not configured')
    return false
  }

  try {
    // Test basic connectivity
    const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_CONFIG.serviceKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.serviceKey}`,
      },
    })

    if (!response.ok) {
      console.log(`  ❌ Supabase error: ${response.status}`)
      return false
    }

    console.log('  ✓ Supabase is reachable')

    // Test client_health_summary view
    const healthResponse = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/client_health_summary?limit=1`,
      {
        headers: {
          'apikey': SUPABASE_CONFIG.serviceKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.serviceKey}`,
        },
      }
    )

    if (healthResponse.ok) {
      const data = await healthResponse.json()
      console.log(`  ✓ client_health_summary accessible (${data.length} sample rows)`)
    } else {
      console.log('  ⚠ client_health_summary may not exist or is inaccessible')
    }

    // Test document_embeddings table
    const embeddingsResponse = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/document_embeddings?limit=1&select=id`,
      {
        headers: {
          'apikey': SUPABASE_CONFIG.serviceKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.serviceKey}`,
        },
      }
    )

    if (embeddingsResponse.ok) {
      const data = await embeddingsResponse.json()
      console.log(`  ✓ document_embeddings accessible (${data.length} sample rows)`)
    } else {
      console.log('  ⚠ document_embeddings may not exist - semantic search will fail')
    }

    return true
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return false
  }
}

const supabaseOk = await testSupabase()
console.log('')

// Test 4: Check RPC Functions
console.log('TEST 4: Supabase RPC Functions')
console.log('-'.repeat(40))

async function testRPCFunctions() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.serviceKey) {
    console.log('  ⚠ Skipping - Supabase not configured')
    return false
  }

  const functions = ['match_documents', 'match_conversation_embeddings']

  for (const funcName of functions) {
    try {
      // We can't actually call these without embeddings, but we can check if they exist
      // by calling with invalid params and checking the error
      const response = await fetch(
        `${SUPABASE_CONFIG.url}/rest/v1/rpc/${funcName}`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_CONFIG.serviceKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )

      const responseText = await response.text()

      if (response.status === 404 || responseText.includes('does not exist')) {
        console.log(`  ⚠ ${funcName}: NOT FOUND - semantic search will fail`)
      } else if (response.status === 400) {
        // 400 with parameter error means function exists but wrong params
        console.log(`  ✓ ${funcName}: exists`)
      } else {
        console.log(`  ? ${funcName}: status ${response.status}`)
      }
    } catch (error) {
      console.log(`  ❌ ${funcName}: ${error.message}`)
    }
  }

  return true
}

await testRPCFunctions()
console.log('')

// Summary
console.log('=' .repeat(60))
console.log('SUMMARY')
console.log('=' .repeat(60))
console.log('')

if (!matchaOk) {
  console.log('🔴 MatchaAI API: FAILING')
  console.log('   This is likely the root cause of workflow failures.')
  console.log('')
  console.log('   NEXT STEPS:')
  console.log('   1. Verify MATCHAAI_API_KEY is correct and not expired')
  console.log('   2. Check if the API endpoint URL has changed')
  console.log('   3. Contact MatchaAI/Harris team to verify API status')
  console.log('   4. Check network connectivity to matcha.harriscomputer.com')
} else {
  console.log('🟢 MatchaAI API: OK')
}

if (!supabaseOk) {
  console.log('🔴 Supabase: FAILING')
  console.log('   Database operations will fail.')
} else {
  console.log('🟢 Supabase: OK')
}

if (!envOk) {
  console.log('🔴 Environment: INCOMPLETE')
} else {
  console.log('🟢 Environment: OK')
}

console.log('')
