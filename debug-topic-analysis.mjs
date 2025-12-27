#!/usr/bin/env node
/**
 * Debug NPS Topic Classification Status
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  console.log('=== NPS Topic Classification Debug ===\n');

  // Check segments first
  const { data: segData } = await supabase
    .from('client_segmentation')
    .select('*');

  const segments = {};
  segData?.forEach(c => {
    const seg = c.segment || c.client_segment || 'Unknown';
    if (!segments[seg]) segments[seg] = [];
    segments[seg].push(c.client_name || c.client);
  });

  console.log('=== Segments ===');
  Object.entries(segments).forEach(([seg, names]) => {
    console.log(`${seg} (${names.length}): ${names.join(', ')}`);
  });

  // Get Leverage segment clients
  const leverageClients = segments['Leverage'] || [];
  console.log('\n=== Leverage Segment Clients ===');
  console.log(leverageClients);

  // Get Q4 25 NPS responses for Leverage clients
  const { data: q4LeverageResponses } = await supabase
    .from('nps_responses')
    .select('id, client_name, feedback, score, period')
    .eq('period', 'Q4 25')
    .in('client_name', leverageClients);

  console.log('\n=== Q4 25 Leverage Responses ===');
  console.log('Count:', q4LeverageResponses?.length);
  q4LeverageResponses?.forEach(r => {
    console.log(`  ID ${r.id}: ${r.client_name} (Score: ${r.score})`);
    console.log(`    ${r.feedback?.substring(0, 80)}...`);
  });

  // Get topic classifications for these responses
  const leverageIds = q4LeverageResponses?.map(r => String(r.id)) || [];
  const { data: leverageTopics } = await supabase
    .from('nps_topic_classifications')
    .select('response_id, topic_name, sentiment')
    .in('response_id', leverageIds);

  console.log('\n=== Leverage Q4 25 Topic Classifications ===');
  console.log('Total classifications:', leverageTopics?.length);

  const topicCounts = {};
  leverageTopics?.forEach(t => {
    const key = `${t.topic_name} (${t.sentiment})`;
    topicCounts[key] = (topicCounts[key] || 0) + 1;
  });

  Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => {
      console.log(`  ${topic}: ${count}`);
    });

  console.log('\n=== General Stats ===');

  // Get all responses with meaningful feedback (excluding '.' and empty)
  const { data: allResponses } = await supabase
    .from('nps_responses')
    .select('id, period, feedback')
    .not('feedback', 'is', null)
    .neq('feedback', '')
    .neq('feedback', '.');

  console.log('Total responses with meaningful feedback:', allResponses?.length);

  // Group by period
  const byPeriod = {};
  allResponses?.forEach(r => {
    byPeriod[r.period] = (byPeriod[r.period] || 0) + 1;
  });
  console.log('By period:', byPeriod);

  // Get all cached response IDs
  const { data: cached } = await supabase
    .from('nps_topic_classifications')
    .select('response_id');

  const cachedIds = new Set(cached?.map(c => c.response_id) || []);
  console.log('\nCached response_ids count (unique):', cachedIds.size);
  console.log('Sample cached IDs:', Array.from(cachedIds).slice(0, 10));

  // Check how many Q4 25 responses are NOT cached
  const q4Responses = allResponses?.filter(r => r.period === 'Q4 25') || [];
  console.log('\nQ4 25 responses with feedback:', q4Responses.length);

  const q4Uncached = q4Responses.filter(r => {
    const hasCache = cachedIds.has(String(r.id));
    return !hasCache;
  });
  console.log('Q4 25 NOT in cache:', q4Uncached.length);
  console.log('Q4 25 IDs (first 10):', q4Responses.map(r => r.id).slice(0, 10));

  // Total uncached
  const allUncached = allResponses?.filter(r => {
    return !cachedIds.has(String(r.id));
  }) || [];
  console.log('\nTotal uncached across all periods:', allUncached.length);

  // Check what periods are uncached
  const uncachedByPeriod = {};
  allUncached.forEach(r => {
    uncachedByPeriod[r.period] = (uncachedByPeriod[r.period] || 0) + 1;
  });
  console.log('Uncached by period:', uncachedByPeriod);

  // Check if the issue is ID type - compare numeric vs string
  console.log('\n=== ID Type Check ===');
  const sampleCachedId = Array.from(cachedIds)[0];
  const sampleResponseId = q4Responses[0]?.id;
  console.log('Sample cached ID type:', typeof sampleCachedId, '- value:', sampleCachedId);
  console.log('Sample Q4 25 response ID type:', typeof sampleResponseId, '- value:', sampleResponseId);
  console.log('String(sampleResponseId):', String(sampleResponseId));
  console.log('Does cache have String(sampleResponseId)?', cachedIds.has(String(sampleResponseId)));
}

debug().catch(console.error);
