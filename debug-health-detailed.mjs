import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugDetailed() {
  console.log('=== Detailed Health Score Analysis ===\n');

  // Get Waikato from the view
  const { data: viewData } = await supabase
    .from('client_health_summary')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .single();

  console.log('=== From client_health_summary view ===');
  console.log('health_score:', viewData?.health_score);
  console.log('nps_score:', viewData?.nps_score);
  console.log('compliance_percentage:', viewData?.compliance_percentage);
  console.log('working_capital_percentage:', viewData?.working_capital_percentage);
  console.log('last_refreshed:', viewData?.last_refreshed);

  // Get raw compliance data
  const { data: complianceData } = await supabase
    .from('segmentation_event_compliance')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .eq('year', 2025);

  console.log('\n=== Raw compliance data (2025) ===');
  console.log(JSON.stringify(complianceData, null, 2));

  // Get raw NPS responses
  const { data: npsData } = await supabase
    .from('nps_responses')
    .select('score, response_date')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .order('response_date', { ascending: false });

  console.log('\n=== All NPS Responses (total:', npsData?.length, ') ===');
  if (npsData) {
    const promoters = npsData.filter(r => r.score >= 9).length;
    const detractors = npsData.filter(r => r.score <= 6).length;
    const total = npsData.length;
    const allTimeNPS = Math.round((promoters / total * 100) - (detractors / total * 100));
    console.log(`Promoters: ${promoters}, Detractors: ${detractors}, Total: ${total}`);
    console.log(`All-time NPS: ${allTimeNPS}`);

    // Recent quarter only
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentResponses = npsData.filter(r => new Date(r.response_date) >= threeMonthsAgo);
    if (recentResponses.length > 0) {
      const recentPromoters = recentResponses.filter(r => r.score >= 9).length;
      const recentDetractors = recentResponses.filter(r => r.score <= 6).length;
      const recentTotal = recentResponses.length;
      const recentNPS = Math.round((recentPromoters / recentTotal * 100) - (recentDetractors / recentTotal * 100));
      console.log(`\nLast 3 months: ${recentResponses.length} responses`);
      console.log(`Recent quarter NPS: ${recentNPS}`);
    }
  }

  // Check the formula being used - calculate both ways
  console.log('\n=== Formula Calculations ===');
  const nps = viewData?.nps_score ?? 0;
  const compliance = viewData?.compliance_percentage ?? 50; // Default 50 if NULL
  const wc = viewData?.working_capital_percentage ?? 100; // Default 100 if NULL

  // v3.0 formula: NPS(40) + Compliance(50) + WC(10)
  const npsPoints = ((nps + 100) / 200) * 40;
  const compliancePoints = (Math.min(100, compliance) / 100) * 50;
  const wcPoints = (Math.min(100, wc) / 100) * 10;
  const v3Score = Math.round(npsPoints + compliancePoints + wcPoints);

  console.log(`Using NPS=${nps}, Compliance=${compliance}, WC=${wc}`);
  console.log(`NPS points: ${npsPoints.toFixed(1)} / 40`);
  console.log(`Compliance points: ${compliancePoints.toFixed(1)} / 50`);
  console.log(`WC points: ${wcPoints.toFixed(1)} / 10`);
  console.log(`v3.0 Calculated Score: ${v3Score}`);
  console.log(`Database Score: ${viewData?.health_score}`);

  // Old formula: NPS(40) + Compliance(60)
  const oldCompliancePoints = (Math.min(100, compliance) / 100) * 60;
  const oldScore = Math.round(npsPoints + oldCompliancePoints);
  console.log(`\nOld formula (NPS 40 + Compliance 60): ${oldScore}`);

  // Check what compliance value would give DB score of 71
  // 71 = ((78+100)/200)*40 + (x/100)*50 + 10
  // 71 = 35.6 + 0.5x + 10
  // 25.4 = 0.5x
  // x = 50.8%
  console.log('\n=== Reverse Engineering ===');
  const reverseCompliance = ((viewData?.health_score - npsPoints - wcPoints) / 50) * 100;
  console.log(`To get DB score of ${viewData?.health_score}, compliance would need to be: ${reverseCompliance.toFixed(1)}%`);
}

debugDetailed().catch(console.error);
