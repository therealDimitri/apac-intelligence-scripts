import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== FIXING 2026 CSI OPEX DATA ===\n');

// FY 2026 values from Excel "26 vs 25 Q Comparison" sheet
const fy2026ExcelValues = {
  license_nr: 1908790,
  ps_nr: 2482649,
  maintenance_nr: 6475993,
  ps_opex: 919564,
  sm_opex: 715949,
  maintenance_opex: 648373,
  rd_opex: 2179371,
  ga_opex: 1163897,
};

// Calculate monthly averages (for even distribution across 12 months)
const monthlyAverages = {
  license_nr: Math.round(fy2026ExcelValues.license_nr / 12),
  ps_nr: Math.round(fy2026ExcelValues.ps_nr / 12),
  maintenance_nr: Math.round(fy2026ExcelValues.maintenance_nr / 12),
  ps_opex: Math.round(fy2026ExcelValues.ps_opex / 12),
  sm_opex: Math.round(fy2026ExcelValues.sm_opex / 12),
  maintenance_opex: Math.round(fy2026ExcelValues.maintenance_opex / 12),
  rd_opex: Math.round(fy2026ExcelValues.rd_opex / 12),
  ga_opex: Math.round(fy2026ExcelValues.ga_opex / 12),
};

console.log('FY 2026 Excel Totals:');
Object.entries(fy2026ExcelValues).forEach(([k, v]) => {
  console.log(`  ${k}: $${v.toLocaleString()}`);
});

console.log('\nMonthly Averages:');
Object.entries(monthlyAverages).forEach(([k, v]) => {
  console.log(`  ${k}: $${v.toLocaleString()}`);
});

// Calculate expected ratios
const totalNR = monthlyAverages.ps_nr + monthlyAverages.license_nr + monthlyAverages.maintenance_nr;
const expectedRatios = {
  ps: monthlyAverages.ps_nr / monthlyAverages.ps_opex,
  sales: (0.7 * monthlyAverages.license_nr) / monthlyAverages.sm_opex,
  maintenance: (0.85 * monthlyAverages.maintenance_nr) / monthlyAverages.maintenance_opex,
  rd: (0.3 * monthlyAverages.license_nr + 0.15 * monthlyAverages.maintenance_nr) / monthlyAverages.rd_opex,
  ga: (monthlyAverages.ga_opex / totalNR) * 100,
};

console.log('\nExpected CSI Ratios (after fix):');
console.log(`  PS Ratio: ${expectedRatios.ps.toFixed(2)} (target ≥2.0)`);
console.log(`  Sales Ratio: ${expectedRatios.sales.toFixed(2)} (target ≥1.0)`);
console.log(`  Maint Ratio: ${expectedRatios.maintenance.toFixed(2)} (target ≥4.0)`);
console.log(`  R&D Ratio: ${expectedRatios.rd.toFixed(2)} (target ≥1.0)`);
console.log(`  G&A Ratio: ${expectedRatios.ga.toFixed(1)}% (target ≤20%)`);

// Compare with Excel CSI ratios
console.log('\nComparison with Excel CSI Ratios (FY 2026):');
console.log('| Ratio | Expected | Excel | Match |');
console.log('|-------|----------|-------|-------|');
console.log(`| Maint | ${expectedRatios.maintenance.toFixed(2)} | 8.49 | ${Math.abs(expectedRatios.maintenance - 8.49) < 0.1 ? '✅' : '❌'}`);
console.log(`| Sales | ${expectedRatios.sales.toFixed(2)} | 1.87 | ${Math.abs(expectedRatios.sales - 1.87) < 0.1 ? '✅' : '❌'}`);
console.log(`| PS | ${expectedRatios.ps.toFixed(2)} | 2.70 | ${Math.abs(expectedRatios.ps - 2.70) < 0.1 ? '✅' : '❌'}`);
console.log(`| G&A | ${expectedRatios.ga.toFixed(1)}% | 8.87% | ${Math.abs(expectedRatios.ga - 8.87) < 0.5 ? '✅' : '❌'}`);

// Get current 2026 data
const { data: current2026, error: fetchError } = await supabase
  .from('burc_csi_opex')
  .select('*')
  .eq('year', 2026)
  .order('month_num', { ascending: true });

if (fetchError) {
  console.error('Error fetching current data:', fetchError.message);
  process.exit(1);
}

console.log(`\nFound ${current2026?.length || 0} rows for 2026\n`);

// Update each month with the correct values
console.log('Updating 2026 monthly values...\n');

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

for (let monthNum = 1; monthNum <= 12; monthNum++) {
  const { error: updateError } = await supabase
    .from('burc_csi_opex')
    .update({
      license_nr: monthlyAverages.license_nr,
      ps_nr: monthlyAverages.ps_nr,
      maintenance_nr: monthlyAverages.maintenance_nr,
      total_nr: totalNR,
      ps_opex: monthlyAverages.ps_opex,
      sm_opex: monthlyAverages.sm_opex,
      maintenance_opex: monthlyAverages.maintenance_opex,
      rd_opex: monthlyAverages.rd_opex,
      ga_opex: monthlyAverages.ga_opex,
      total_opex: monthlyAverages.ps_opex + monthlyAverages.sm_opex +
                  monthlyAverages.maintenance_opex + monthlyAverages.rd_opex +
                  monthlyAverages.ga_opex,
      source_file: '2026 APAC Performance.xlsx (26 vs 25 Q Comparison)',
      updated_at: new Date().toISOString(),
    })
    .eq('year', 2026)
    .eq('month_num', monthNum);

  if (updateError) {
    console.error(`Error updating ${months[monthNum - 1]} 2026:`, updateError.message);
  } else {
    console.log(`✅ Updated ${months[monthNum - 1]} 2026`);
  }
}

// Verify the update
console.log('\n=== VERIFYING UPDATE ===\n');

const { data: updated2026, error: verifyError } = await supabase
  .from('burc_csi_opex')
  .select('*')
  .eq('year', 2026)
  .eq('month_num', 12)
  .single();

if (verifyError) {
  console.error('Error verifying:', verifyError.message);
} else {
  console.log('December 2026 (after update):');
  console.log(`  License NR: $${updated2026.license_nr?.toLocaleString()}`);
  console.log(`  PS NR: $${updated2026.ps_nr?.toLocaleString()}`);
  console.log(`  Maintenance NR: $${updated2026.maintenance_nr?.toLocaleString()}`);
  console.log(`  Total NR: $${updated2026.total_nr?.toLocaleString()}`);
  console.log(`  PS OPEX: $${updated2026.ps_opex?.toLocaleString()}`);
  console.log(`  S&M OPEX: $${updated2026.sm_opex?.toLocaleString()}`);
  console.log(`  Maint OPEX: $${updated2026.maintenance_opex?.toLocaleString()}`);
  console.log(`  R&D OPEX: $${updated2026.rd_opex?.toLocaleString()}`);
  console.log(`  G&A OPEX: $${updated2026.ga_opex?.toLocaleString()}`);

  // Calculate actual ratios
  const actualTotalNR = updated2026.ps_nr + updated2026.license_nr + updated2026.maintenance_nr;
  const actualRatios = {
    ps: updated2026.ps_nr / updated2026.ps_opex,
    sales: (0.7 * updated2026.license_nr) / updated2026.sm_opex,
    maintenance: (0.85 * updated2026.maintenance_nr) / updated2026.maintenance_opex,
    rd: (0.3 * updated2026.license_nr + 0.15 * updated2026.maintenance_nr) / updated2026.rd_opex,
    ga: (updated2026.ga_opex / actualTotalNR) * 100,
  };

  console.log('\nActual CSI Ratios (Dec 2026):');
  console.log(`  PS Ratio: ${actualRatios.ps.toFixed(2)}`);
  console.log(`  Sales Ratio: ${actualRatios.sales.toFixed(2)}`);
  console.log(`  Maint Ratio: ${actualRatios.maintenance.toFixed(2)}`);
  console.log(`  R&D Ratio: ${actualRatios.rd.toFixed(2)}`);
  console.log(`  G&A Ratio: ${actualRatios.ga.toFixed(1)}%`);
}

console.log('\n✅ 2026 CSI OPEX data has been updated to match Excel values.');
