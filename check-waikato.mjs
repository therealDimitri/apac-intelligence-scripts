import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check client_health_summary for Waikato
  const { data: healthData } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage, working_capital_percentage, last_refreshed')
    .eq('client_name', 'Te Whatu Ora Waikato');
    
  console.log('=== client_health_summary (Waikato) ===');
  console.log(JSON.stringify(healthData, null, 2));
  
  // Check NPS responses for Waikato
  const { data: npsData } = await supabase
    .from('nps_responses')
    .select('score, response_date')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .order('response_date', { ascending: false })
    .limit(10);
    
  console.log('\n=== Recent NPS Responses (Waikato) ===');
  console.log(JSON.stringify(npsData, null, 2));
  
  // Check compliance
  const { data: complianceData } = await supabase
    .from('segmentation_event_compliance')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .eq('year', 2025);
    
  console.log('\n=== Compliance (Waikato 2025) ===');
  console.log(JSON.stringify(complianceData, null, 2));
  
  // Calculate what the score SHOULD be
  const nps = healthData?.[0]?.nps_score ?? 0;
  const compliance = Math.min(100, healthData?.[0]?.compliance_percentage ?? 50);
  const workingCapital = Math.min(100, healthData?.[0]?.working_capital_percentage ?? 100);
  
  const npsPoints = Math.round(((nps + 100) / 200) * 40);
  const compliancePoints = Math.round((compliance / 100) * 50);
  const workingCapitalPoints = Math.round((workingCapital / 100) * 10);
  
  console.log('\n=== Calculated Health Score ===');
  console.log('NPS:', nps, '→', npsPoints, 'points');
  console.log('Compliance:', compliance, '→', compliancePoints, 'points');
  console.log('Working Capital:', workingCapital, '→', workingCapitalPoints, 'points');
  console.log('TOTAL:', npsPoints + compliancePoints + workingCapitalPoints);
  console.log('Database shows:', healthData?.[0]?.health_score);
}

check().catch(console.error);
