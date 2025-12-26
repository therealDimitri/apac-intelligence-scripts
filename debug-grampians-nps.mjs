import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  console.log('=== Debugging Grampians Health NPS Discrepancy ===\n');

  // 1. Get all NPS responses for Grampians Health
  const { data: responses } = await supabase
    .from('nps_responses')
    .select('*')
    .eq('client_name', 'Grampians Health')
    .order('response_date', { ascending: false });

  console.log('=== 1. All NPS Responses for Grampians Health ===');
  console.log('Total responses:', responses?.length);
  responses?.forEach(r => {
    const category = r.score >= 9 ? 'Promoter' : r.score >= 7 ? 'Passive' : 'Detractor';
    console.log(`  ${r.response_date}: Score ${r.score} (${category})`);
  });

  // 2. Calculate NPS from ALL responses
  if (responses && responses.length > 0) {
    const promoters = responses.filter(r => r.score >= 9).length;
    const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length;
    const detractors = responses.filter(r => r.score <= 6).length;
    const total = responses.length;
    const allTimeNPS = Math.round(((promoters - detractors) / total) * 100);

    console.log('\n=== 2. All-Time NPS Calculation ===');
    console.log(`Promoters: ${promoters}, Passives: ${passives}, Detractors: ${detractors}`);
    console.log(`All-time NPS: ((${promoters} - ${detractors}) / ${total}) * 100 = ${allTimeNPS}`);
  }

  // 3. Group by quarter and calculate NPS per quarter
  console.log('\n=== 3. NPS by Quarter ===');
  const quarters = {};
  responses?.forEach(r => {
    const date = new Date(r.response_date);
    const quarter = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
    if (!quarters[quarter]) quarters[quarter] = [];
    quarters[quarter].push(r);
  });

  Object.keys(quarters).sort().reverse().forEach(q => {
    const qResponses = quarters[q];
    const promoters = qResponses.filter(r => r.score >= 9).length;
    const detractors = qResponses.filter(r => r.score <= 6).length;
    const total = qResponses.length;
    const nps = Math.round(((promoters - detractors) / total) * 100);
    console.log(`  ${q}: ${total} responses, NPS = ${nps} (P:${promoters}, D:${detractors})`);
  });

  // 4. Check what client_health_summary shows
  const { data: health } = await supabase
    .from('client_health_summary')
    .select('nps_score, health_score, response_count')
    .eq('client_name', 'Grampians Health')
    .single();

  console.log('\n=== 4. client_health_summary Data ===');
  console.log('NPS Score:', health?.nps_score);
  console.log('Health Score:', health?.health_score);
  console.log('Response Count:', health?.response_count);

  // 5. Find most recent quarter with data
  if (responses && responses.length > 0) {
    const mostRecentDate = new Date(responses[0].response_date);
    const quarterStart = new Date(mostRecentDate.getFullYear(), Math.floor(mostRecentDate.getMonth() / 3) * 3, 1);

    console.log('\n=== 5. Most Recent Quarter Analysis ===');
    console.log('Most recent response date:', responses[0].response_date);
    console.log('Quarter start:', quarterStart.toISOString().split('T')[0]);

    const recentQuarterResponses = responses.filter(r => new Date(r.response_date) >= quarterStart);
    console.log('Responses in most recent quarter:', recentQuarterResponses.length);

    if (recentQuarterResponses.length > 0) {
      const promoters = recentQuarterResponses.filter(r => r.score >= 9).length;
      const detractors = recentQuarterResponses.filter(r => r.score <= 6).length;
      const total = recentQuarterResponses.length;
      const recentNPS = Math.round(((promoters - detractors) / total) * 100);
      console.log(`Most recent quarter NPS: ${recentNPS}`);
    }
  }

  // 6. Check what the migration SQL is doing
  console.log('\n=== 6. Expected Behavior ===');
  console.log('The client_health_summary view should calculate NPS from the MOST RECENT QUARTER.');
  console.log('The "Most Recent NPS Result" card likely calculates from all responses or a different period.');
}

debug().catch(console.error);
