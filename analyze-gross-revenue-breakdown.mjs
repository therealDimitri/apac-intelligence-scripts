import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2025/2025 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== GROSS REVENUE BREAKDOWN ANALYSIS ===\n');

// Get the APAC BURC sheet and find annual totals
const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

  // Find the FY 2025 Total column - should be around column 14-16
  console.log('Header row analysis:');
  const row6 = data[5] || [];
  const row7 = data[6] || [];
  const row8 = data[7] || [];

  // Print columns 10-20 to find FY Total
  console.log('Row 6:', row6.slice(10, 20).map((c, i) => (i+10) + ':' + c).join(' | '));
  console.log('Row 7:', row7.slice(10, 20).map((c, i) => (i+10) + ':' + c).join(' | '));
  console.log('Row 8:', row8.slice(10, 20).map((c, i) => (i+10) + ':' + c).join(' | '));

  // Find Q4 and FY Total columns
  let q4Col = -1;
  let fyTotalCol = -1;

  row6.forEach((cell, i) => {
    if (cell && String(cell).includes('Q4')) q4Col = i;
    if (cell && String(cell).toLowerCase().includes('fy') && String(cell).toLowerCase().includes('total')) fyTotalCol = i;
  });
  row7.forEach((cell, i) => {
    if (cell && String(cell).toLowerCase().includes('fy') && String(cell).toLowerCase().includes('total')) fyTotalCol = i;
  });

  console.log('\nQ4 column:', q4Col);
  console.log('FY Total column:', fyTotalCol);

  // Print key revenue lines with their FY totals
  console.log('\n=== Revenue Breakdown (FY2025/2026) ===\n');

  const revenueRows = [
    { label: 'Gross License Revenue', keywords: ['gross license'] },
    { label: 'Gross PS Revenue', keywords: ['gross professional', 'gross ps'] },
    { label: 'Gross Maintenance Revenue', keywords: ['gross maintenance'] },
    { label: 'Gross Hardware Revenue', keywords: ['gross hardware'] },
    { label: 'Total Gross Revenue', keywords: ['gross revenue (actual'] },
  ];

  data.forEach((row, i) => {
    if (row && row[0]) {
      const label = String(row[0]).toLowerCase();
      revenueRows.forEach(r => {
        if (r.keywords.some(k => label.includes(k))) {
          // Get values from multiple columns to find the annual total
          const values = row.slice(10, 20).filter(v => typeof v === 'number');
          const maxVal = Math.max(...values.filter(v => v > 1000000));
          const lastVal = values[values.length - 1];

          console.log('Row ' + (i+1) + ': ' + row[0]);
          console.log('  Values: ' + values.map(v => '$' + Math.round(v).toLocaleString()).join(', '));
          if (fyTotalCol > 0 && row[fyTotalCol]) {
            console.log('  FY Total (col ' + fyTotalCol + '): $' + Math.round(row[fyTotalCol]).toLocaleString());
          }
          console.log('');
        }
      });
    }
  });
}

// Now check the database
console.log('\n=== DATABASE GROSS REVENUE CHECK ===\n');

const { data: financials } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .eq('fiscal_year', 2026)
  .single();

if (financials) {
  console.log('FY2026 in burc_annual_financials:');
  console.log('  Gross Revenue: $' + (financials.gross_revenue || 0).toLocaleString());
  console.log('  EBITA: $' + (financials.ebita || 0).toLocaleString());
  console.log('  NRR: ' + (financials.nrr_percent || 0) + '%');
  console.log('  GRR: ' + (financials.grr_percent || 0) + '%');
  console.log('  Churn: $' + (financials.churn || 0).toLocaleString());
  console.log('  Expansion: $' + (financials.expansion || 0).toLocaleString());
}

// Check what the executive summary shows
console.log('\n=== EXECUTIVE SUMMARY VIEW ===\n');
const { data: summary } = await supabase
  .from('burc_executive_summary')
  .select('*')
  .single();

if (summary) {
  console.log('Total ARR: $' + (summary.total_arr || 0).toLocaleString());
  console.log('Total Pipeline: $' + (summary.total_pipeline || 0).toLocaleString());
  console.log('Weighted Pipeline: $' + (summary.weighted_pipeline || 0).toLocaleString());
}

// Check if there are duplicates in pipeline or other revenue tables
console.log('\n=== CHECKING FOR DUPLICATES IN DATABASE ===\n');

// Check burc_pipeline_detail for duplicates
const { data: pipeline } = await supabase
  .from('burc_pipeline_detail')
  .select('*')
  .eq('fiscal_year', 2026);

if (pipeline) {
  // Group by deal name or client
  const byDeal = {};
  pipeline.forEach(p => {
    const key = p.deal_name || p.client_name || 'Unknown';
    if (!byDeal[key]) byDeal[key] = [];
    byDeal[key].push(p);
  });

  const duplicates = Object.entries(byDeal).filter(([, items]) => items.length > 1);
  if (duplicates.length > 0) {
    console.log('Pipeline duplicates found:');
    duplicates.forEach(([name, items]) => {
      console.log('  ' + name + ': ' + items.length + ' entries');
      items.forEach(item => {
        console.log('    - $' + (item.total_revenue || 0).toLocaleString());
      });
    });
  } else {
    console.log('No pipeline duplicates found');
  }

  // Check for "Total" entries
  const totalEntries = pipeline.filter(p =>
    (p.deal_name || p.client_name || '').toLowerCase().includes('total')
  );
  if (totalEntries.length > 0) {
    console.log('\n"Total" entries in pipeline:');
    totalEntries.forEach(t => {
      console.log('  ' + (t.deal_name || t.client_name) + ': $' + (t.total_revenue || 0).toLocaleString());
    });
  }
}
