import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const burcPath = BURC_MASTER_FILE;

const workbook = XLSX.readFile(burcPath);
const burcSheet = workbook.Sheets['APAC BURC'];
const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

console.log('=== FIXING 2026 CSI OPEX FROM APAC BURC MONTHLY VALUES ===\n');

// Row mappings (1-indexed row numbers from Excel)
const rowMap = {
  license_nr: 56,
  ps_nr: 57,
  maintenance_nr: 58,
  ps_opex: 69,
  maintenance_opex: 74,
  sm_opex: 80,
  rd_opex: 86,
  ga_opex: 93,
  total_nr: 64, // "Net Revenue Excluding Pipeline" row
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Extract monthly values from Excel
const monthlyData = [];

for (let monthNum = 1; monthNum <= 12; monthNum++) {
  const colIndex = monthNum; // Col 1 = Jan, Col 2 = Feb, etc.

  const values = {};
  for (const [field, rowNum] of Object.entries(rowMap)) {
    const row = data[rowNum - 1]; // Convert to 0-indexed
    const val = row ? row[colIndex] : null;
    values[field] = typeof val === 'number' ? val : 0;
  }

  // Calculate total_nr if not available (sum of License + PS + Maint + BC)
  // Using the Net Revenue row if available, otherwise calculate
  if (values.total_nr === 0) {
    values.total_nr = values.license_nr + values.ps_nr + values.maintenance_nr;
  }

  monthlyData.push({
    month: months[monthNum - 1],
    monthNum,
    ...values,
  });
}

console.log('Monthly values extracted from APAC BURC:\n');
console.log('Month | License NR | PS NR | Maint NR | Total NR | PS OPEX | S&M OPEX | Maint OPEX | R&D OPEX | G&A OPEX');
console.log('-'.repeat(120));

monthlyData.forEach(m => {
  console.log(
    m.month.padEnd(5) + ' | ' +
    ('$' + Math.round(m.license_nr / 1000) + 'K').padStart(10) + ' | ' +
    ('$' + Math.round(m.ps_nr / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.maintenance_nr / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.total_nr / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.ps_opex / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.sm_opex / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.maintenance_opex / 1000) + 'K').padStart(10) + ' | ' +
    ('$' + Math.round(m.rd_opex / 1000) + 'K').padStart(8) + ' | ' +
    ('$' + Math.round(m.ga_opex / 1000) + 'K').padStart(8)
  );
});

// Calculate what ratios will be for each month
console.log('\n\nCalculated CSI Ratios (from these values):\n');
console.log('Month | Maint | Sales | PS | R&D | G&A');
console.log('-'.repeat(60));

monthlyData.forEach(m => {
  const maintRatio = m.maintenance_opex > 0 ? (0.85 * m.maintenance_nr) / m.maintenance_opex : 0;
  const salesRatio = m.sm_opex > 0 ? (0.7 * m.license_nr) / m.sm_opex : 0;
  const psRatio = m.ps_opex > 0 ? m.ps_nr / m.ps_opex : 0;
  const rdRatio = m.rd_opex > 0 ? (0.3 * m.license_nr + 0.15 * m.maintenance_nr) / m.rd_opex : 0;
  const gaRatio = m.total_nr > 0 ? (m.ga_opex / m.total_nr) * 100 : 0;

  console.log(
    m.month.padEnd(5) + ' | ' +
    maintRatio.toFixed(2).padStart(5) + ' | ' +
    salesRatio.toFixed(2).padStart(5) + ' | ' +
    psRatio.toFixed(2).padStart(5) + ' | ' +
    rdRatio.toFixed(2).padStart(5) + ' | ' +
    (gaRatio.toFixed(1) + '%').padStart(6)
  );
});

// Update database
console.log('\n\nUpdating database with APAC BURC monthly values...\n');

for (const m of monthlyData) {
  // Skip months with no data (Jan has all zeros in Excel)
  if (m.ps_nr === 0 && m.maintenance_nr === 0 && m.monthNum === 1) {
    console.log(`⏭️  Skipping ${m.month} (no data in Excel)`);
    continue;
  }

  const { error } = await supabase
    .from('burc_csi_opex')
    .update({
      license_nr: m.license_nr,
      ps_nr: m.ps_nr,
      maintenance_nr: m.maintenance_nr,
      total_nr: m.total_nr,
      ps_opex: m.ps_opex,
      sm_opex: m.sm_opex,
      maintenance_opex: m.maintenance_opex,
      rd_opex: m.rd_opex,
      ga_opex: m.ga_opex,
      source_file: '2026 APAC Performance.xlsx (APAC BURC monthly)',
      updated_at: new Date().toISOString(),
    })
    .eq('year', 2026)
    .eq('month_num', m.monthNum);

  if (error) {
    console.error(`❌ Error updating ${m.month}:`, error.message);
  } else {
    console.log(`✅ Updated ${m.month} 2026`);
  }
}

// Verify Dec 2026
console.log('\n=== VERIFICATION (Dec 2026) ===\n');

const { data: dec2026 } = await supabase
  .from('burc_csi_opex')
  .select('*')
  .eq('year', 2026)
  .eq('month_num', 12)
  .single();

if (dec2026) {
  const maintRatio = (0.85 * dec2026.maintenance_nr) / dec2026.maintenance_opex;
  const salesRatio = (0.7 * dec2026.license_nr) / dec2026.sm_opex;
  const psRatio = dec2026.ps_nr / dec2026.ps_opex;
  const rdRatio = (0.3 * dec2026.license_nr + 0.15 * dec2026.maintenance_nr) / dec2026.rd_opex;
  const gaRatio = (dec2026.ga_opex / dec2026.total_nr) * 100;

  console.log('Dec 2026 CSI Ratios:');
  console.log(`  Maint Ratio: ${maintRatio.toFixed(2)} (Excel shows 5.69)`);
  console.log(`  Sales Ratio: ${salesRatio.toFixed(2)} (Excel shows 0.00)`);
  console.log(`  PS Ratio: ${psRatio.toFixed(2)} (Excel shows 2.43)`);
  console.log(`  R&D Ratio: ${rdRatio.toFixed(2)} (Excel shows 29.9%)`);
  console.log(`  G&A Ratio: ${gaRatio.toFixed(1)}% (Excel shows 17.7%)`);
}

console.log('\n✅ Database updated with APAC BURC monthly values.');
