import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkQuarterlyNPS() {
  const { data: epworthNPS } = await supabase
    .from('nps_responses')
    .select('client_name, score, category, period')
    .ilike('client_name', '%Epworth%')
    .order('period', { ascending: false });

  console.log('=== All Epworth NPS by Period ===');

  const byPeriod = {};
  for (const row of epworthNPS || []) {
    const period = row.period || 'Unknown';
    if (byPeriod[period] === undefined) {
      byPeriod[period] = { promoters: 0, passives: 0, detractors: 0, total: 0 };
    }
    byPeriod[period].total++;
    if (row.score >= 9) byPeriod[period].promoters++;
    else if (row.score >= 7) byPeriod[period].passives++;
    else byPeriod[period].detractors++;
  }

  for (const [period, data] of Object.entries(byPeriod)) {
    const nps = Math.round(((data.promoters - data.detractors) / data.total) * 100);
    console.log(period + ': NPS = ' + nps + ' (P:' + data.promoters + ' Pa:' + data.passives + ' D:' + data.detractors + ' Total:' + data.total + ')');
  }

  console.log('\n=== client_health_history nps_points for Epworth ===');
  const { data: healthData } = await supabase
    .from('client_health_history')
    .select('client_name, nps_points, snapshot_date')
    .ilike('client_name', '%Epworth%')
    .order('snapshot_date', { ascending: false })
    .limit(5);

  console.log(healthData);
}

checkQuarterlyNPS();
