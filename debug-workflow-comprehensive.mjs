#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MATCHAAI_KEY = process.env.MATCHAAI_API_KEY;
const MATCHAAI_URL = process.env.MATCHAAI_BASE_URL;

console.log('='.repeat(60));
console.log('COMPREHENSIVE WORKFLOW DEBUG');
console.log('='.repeat(60));
console.log('');

// Test 1: Environment
console.log('1. ENVIRONMENT VARIABLES');
console.log('-'.repeat(40));
console.log(`   SUPABASE_URL: ${SUPABASE_URL ? '✓ SET' : '✗ MISSING'}`);
console.log(`   SUPABASE_KEY: ${SUPABASE_KEY ? '✓ SET' : '✗ MISSING'}`);
console.log(`   MATCHAAI_KEY: ${MATCHAAI_KEY ? '✓ SET' : '✗ MISSING'}`);
console.log(`   MATCHAAI_URL: ${MATCHAAI_URL || 'DEFAULT'}`);
console.log('');

// Test 2: MatchaAI API directly
console.log('2. MATCHAAI API TEST');
console.log('-'.repeat(40));
try {
  const matchaResponse = await fetch(`${MATCHAAI_URL || 'https://matcha.harriscomputer.com/rest/api/v1'}/completions`, {
    method: 'POST',
    headers: {
      'MATCHA-API-KEY': MATCHAAI_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mission_id: parseInt(process.env.MATCHAAI_MISSION_ID || '1397'),
      llm_id: 28,
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 50,
    }),
  });

  const contentType = matchaResponse.headers.get('content-type');
  console.log(`   Status: ${matchaResponse.status}`);
  console.log(`   Content-Type: ${contentType}`);

  if (contentType?.includes('application/json')) {
    const data = await matchaResponse.json();
    console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);
    console.log('   ✓ MatchaAI API working');
  } else {
    const text = await matchaResponse.text();
    console.log(`   ✗ Non-JSON response: ${text.substring(0, 300)}`);
  }
} catch (error) {
  console.log(`   ✗ Error: ${error.message}`);
}
console.log('');

// Test 3: Supabase connectivity
console.log('3. SUPABASE CONNECTIVITY');
console.log('-'.repeat(40));
try {
  const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/client_health_summary?select=client_name&limit=1`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  const contentType = supabaseResponse.headers.get('content-type');
  console.log(`   Status: ${supabaseResponse.status}`);
  console.log(`   Content-Type: ${contentType}`);

  if (supabaseResponse.ok) {
    const data = await supabaseResponse.json();
    console.log(`   ✓ Supabase connected (${data.length} rows)`);
  } else {
    const text = await supabaseResponse.text();
    console.log(`   ✗ Error: ${text.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`   ✗ Error: ${error.message}`);
}
console.log('');

// Test 4: Test RPC functions via REST API
console.log('4. RPC FUNCTION TESTS (via REST)');
console.log('-'.repeat(40));

// Test match_documents with minimal vector
try {
  const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: Array(1536).fill(0.01),
      match_threshold: 0.1,
      match_count: 1,
    }),
  });

  console.log(`   match_documents: ${rpcResponse.status}`);

  if (rpcResponse.ok) {
    const data = await rpcResponse.json();
    console.log(`   ✓ Function works - returned ${data.length} results`);
  } else {
    const text = await rpcResponse.text();
    console.log(`   ✗ Error: ${text.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`   ✗ match_documents error: ${error.message}`);
}

// Test match_conversation_embeddings
try {
  const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_conversation_embeddings`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: Array(1536).fill(0.01),
      match_threshold: 0.1,
      match_count: 1,
    }),
  });

  console.log(`   match_conversation_embeddings: ${rpcResponse.status}`);

  if (rpcResponse.ok) {
    const data = await rpcResponse.json();
    console.log(`   ✓ Function works - returned ${data.length} results`);
  } else {
    const text = await rpcResponse.text();
    console.log(`   ✗ Error: ${text.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`   ✗ match_conversation_embeddings error: ${error.message}`);
}
console.log('');

// Test 5: Check if production API is returning HTML
console.log('5. PRODUCTION API CHECK');
console.log('-'.repeat(40));
try {
  // Test the production URL if deployed
  const prodUrl = 'https://apac-intelligence-v2.netlify.app/api/chasen/workflow';
  const prodResponse = await fetch(prodUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow: 'risk-assessment',
      query: 'Test',
    }),
  });

  const contentType = prodResponse.headers.get('content-type');
  console.log(`   Production URL: ${prodUrl}`);
  console.log(`   Status: ${prodResponse.status}`);
  console.log(`   Content-Type: ${contentType}`);

  if (!contentType?.includes('application/json')) {
    const text = await prodResponse.text();
    console.log(`   ✗ HTML Response (first 500 chars):`);
    console.log(`   ${text.substring(0, 500)}`);
  } else {
    const data = await prodResponse.json();
    console.log(`   Response: ${JSON.stringify(data).substring(0, 300)}`);
  }
} catch (error) {
  console.log(`   Note: ${error.message}`);
}

console.log('');
console.log('='.repeat(60));
console.log('DEBUG COMPLETE');
console.log('='.repeat(60));
