import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugGARatio() {
  console.log('=== G&A Ratio Debug ===\n');

  // Fetch recent burc_csi_opex data
  const { data: opexData, error: opexError } = await supabase
    .from('burc_csi_opex')
    .select('*')
    .order('year', { ascending: false })
    .order('month_num', { ascending: false })
    .limit(12);

  if (opexError) {
    console.log('Error fetching burc_csi_opex:', opexError.message);
    return;
  }

  if (!opexData || opexData.length === 0) {
    console.log('No BURC OPEX data found');
    return;
  }

  console.log('=== Recent BURC CSI OPEX Data ===\n');
  console.log('Month\t\tTotal NR\tG&A OPEX\tG&A Ratio\tFormula Check');
  console.log('-----\t\t--------\t--------\t---------\t-------------');

  opexData.forEach(row => {
    const totalNR = row.total_nr || 0;
    const gaOpex = row.ga_opex || 0;

    // G&A Ratio = (G&A OPEX / Total Revenue) × 100
    const gaRatio = totalNR > 0 ? (gaOpex / totalNR) * 100 : 0;
    const gaRatioRounded = Math.round(gaRatio * 10) / 10;

    const formulaCheck = `${gaOpex.toLocaleString()} / ${totalNR.toLocaleString()} × 100 = ${gaRatioRounded}%`;

    console.log(`${row.month} ${row.year}\t${totalNR.toLocaleString()}\t\t${gaOpex.toLocaleString()}\t\t${gaRatioRounded}%\t\t${formulaCheck}`);
  });

  // Check for data quality issues
  console.log('\n=== Data Quality Checks ===\n');

  const issues = [];
  opexData.forEach(row => {
    const totalNR = row.total_nr || 0;
    const gaOpex = row.ga_opex || 0;
    const gaRatio = totalNR > 0 ? (gaOpex / totalNR) * 100 : 0;

    if (totalNR === 0) {
      issues.push(`${row.month} ${row.year}: Total NR is zero`);
    }
    if (gaRatio > 100) {
      issues.push(`${row.month} ${row.year}: G&A Ratio exceeds 100% (${Math.round(gaRatio)}%)`);
    }
    if (gaRatio > 20) {
      issues.push(`${row.month} ${row.year}: G&A Ratio exceeds 20% target (${Math.round(gaRatio)}%)`);
    }
    if (gaOpex > totalNR && totalNR > 0) {
      issues.push(`${row.month} ${row.year}: G&A OPEX (${gaOpex.toLocaleString()}) exceeds Total NR (${totalNR.toLocaleString()})`);
    }
  });

  if (issues.length === 0) {
    console.log('✓ No data quality issues found');
  } else {
    console.log('Issues found:');
    issues.forEach(issue => console.log('  ⚠️ ' + issue));
  }

  // Show underlying components
  console.log('\n=== Revenue Components (Latest Month) ===');
  const latest = opexData[0];
  console.log(`License NR: ${(latest.license_nr || 0).toLocaleString()}`);
  console.log(`PS NR: ${(latest.ps_nr || 0).toLocaleString()}`);
  console.log(`Maintenance NR: ${(latest.maintenance_nr || 0).toLocaleString()}`);
  console.log(`Total NR: ${(latest.total_nr || 0).toLocaleString()}`);
  console.log(`\nSum check: ${((latest.license_nr || 0) + (latest.ps_nr || 0) + (latest.maintenance_nr || 0)).toLocaleString()}`);

  console.log('\n=== OPEX Components (Latest Month) ===');
  console.log(`PS OPEX: ${(latest.ps_opex || 0).toLocaleString()}`);
  console.log(`S&M OPEX: ${(latest.sm_opex || 0).toLocaleString()}`);
  console.log(`Maintenance OPEX: ${(latest.maintenance_opex || 0).toLocaleString()}`);
  console.log(`R&D OPEX: ${(latest.rd_opex || 0).toLocaleString()}`);
  console.log(`G&A OPEX: ${(latest.ga_opex || 0).toLocaleString()}`);
  console.log(`Total OPEX: ${(latest.total_opex || 0).toLocaleString()}`);

  // Also check if there's a ratio table
  const { data: ratioData, error: ratioError } = await supabase
    .from('burc_csi_ratios')
    .select('*')
    .order('year', { ascending: false })
    .order('month_num', { ascending: false })
    .limit(6);

  if (!ratioError && ratioData && ratioData.length > 0) {
    console.log('\n=== Pre-calculated Ratios from burc_csi_ratios ===');
    ratioData.forEach(row => {
      console.log(`${row.month} ${row.year}: G&A = ${row.ga_ratio || 'N/A'}%`);
    });
  }
}

debugGARatio().catch(console.error);
