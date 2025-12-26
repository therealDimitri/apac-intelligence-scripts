import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCompliance() {
  // Check ALL compliance data for Waikato (any year)
  const { data: allCompliance } = await supabase
    .from('segmentation_event_compliance')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .order('year', { ascending: false });

  console.log('=== All compliance data for Waikato (any year) ===');
  console.log(JSON.stringify(allCompliance, null, 2));

  // Also check what years have compliance data
  const { data: years } = await supabase
    .from('segmentation_event_compliance')
    .select('year')
    .eq('client_name', 'Te Whatu Ora Waikato');

  console.log('\n=== Years with compliance data ===');
  console.log(years);

  // Check the view for all clients with compliance issues
  console.log('\n=== Checking compliance_percentage vs health_score correlation ===');
  const { data: clients } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, compliance_percentage, nps_score, working_capital_percentage')
    .order('client_name');

  for (const c of clients) {
    // Get raw compliance for this client
    const { data: rawComp } = await supabase
      .from('segmentation_event_compliance')
      .select('compliance_percentage, year')
      .eq('client_name', c.client_name)
      .eq('year', 2025);

    const hasRawData = rawComp && rawComp.length > 0;
    const viewCompliance = c.compliance_percentage;

    // Check if there's a mismatch
    if (viewCompliance !== null && !hasRawData) {
      console.log(`${c.client_name}: View shows ${viewCompliance}% compliance but NO 2025 raw data!`);
    } else if (hasRawData) {
      const rawAvg = rawComp.reduce((sum, r) => sum + (r.compliance_percentage || 0), 0) / rawComp.length;
      if (Math.round(rawAvg) !== Math.round(viewCompliance)) {
        console.log(`${c.client_name}: Raw avg=${rawAvg.toFixed(1)}, View=${viewCompliance}`);
      }
    }
  }
}

checkCompliance().catch(console.error);
