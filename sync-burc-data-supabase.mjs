#!/usr/bin/env node
/**
 * Sync BURC Data via Supabase REST API
 *
 * This version uses Supabase client instead of direct pg connection,
 * which works through firewalls and doesn't require port 5432/6543 access.
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Source of truth for 2024 actuals, 2025 actuals, and 2026 forecasts
// SharePoint: https://alteradh.sharepoint.com/teams/APACLeadershipTeam/Shared Documents/General/Performance/Financials/BURC/2026/2026 APAC Performance.xls
const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function syncBurcData() {
  console.log('📊 Syncing BURC data from Excel file...');
  console.log(`   File: ${BURC_PATH}\n`);

  try {
    // Test connection
    const { error: testError } = await supabase.from('burc_ebita_monthly').select('count').limit(1);
    if (testError) throw new Error(`Connection test failed: ${testError.message}`);
    console.log('✅ Connected to Supabase\n');

    // Read BURC file
    const workbook = XLSX.readFile(BURC_PATH);

    // List all worksheets being synced
    console.log('📋 Worksheets in file:', workbook.SheetNames.join(', '));
    console.log('');

    // Sync all data - ORDER MATTERS: Annual Financials first as it's the source of truth
    await syncAnnualFinancials(workbook);  // NEW: Syncs FY2025/2026 gross revenue from APAC BURC sheet
    await syncEbitaData(workbook);
    await syncQuarterlyComparison(workbook);
    await syncWaterfallData(workbook);
    await syncClientMaintenance(workbook);
    await syncPsPipeline(workbook);
    await syncRevenueStreams(workbook);

    // Log sync
    await supabase.from('burc_sync_log').insert({
      synced_at: new Date().toISOString(),
      file_path: BURC_PATH,
      status: 'success'
    });

    console.log('\n✅ BURC data synced successfully!');
    console.log(`   Last sync: ${new Date().toISOString()}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

/**
 * Sync Annual Financials from multiple sheets using direct cell references:
 * - FY2026 Forecast: APAC BURC sheet, Cell U36 ($31.170M)
 * - FY2026 Target: APAC BURC sheet, Cell W36 ($30.906M)
 * - FY2025 Actual: 26 vs 25 Q Comparison sheet, Cell P14 ($26.345M)
 */
async function syncAnnualFinancials(workbook) {
  console.log('💵 Extracting Annual Financials (using direct cell references)...');

  let fy2026Total = null;
  let fy2025Total = null;

  // === FY2026: From APAC BURC sheet, Row 36 ===
  const apacSheet = workbook.Sheets['APAC BURC'];
  if (apacSheet) {
    // Direct cell references for accuracy
    const cellU36 = apacSheet['U36']?.v; // FY2026 Forecast
    const cellW36 = apacSheet['W36']?.v; // FY2026 Target
    const cellA36 = apacSheet['A36']?.v; // Row label for verification

    if (cellU36 && typeof cellU36 === 'number') {
      fy2026Total = cellU36;
      console.log(`   FY2026 Forecast from APAC BURC (Cell U36): $${(fy2026Total / 1000000).toFixed(3)}M`);
      console.log(`   FY2026 Target from APAC BURC (Cell W36): $${(cellW36 / 1000000).toFixed(3)}M`);
      console.log(`   Row label: "${cellA36}"`);
    } else {
      console.log('   ⚠️ Could not read FY2026 from APAC BURC cell U36');
    }
  } else {
    console.log('   ⚠️ Sheet not found: APAC BURC');
  }

  // === FY2025: From 26 vs 25 Q Comparison sheet, Row 14 ===
  const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
  if (compSheet) {
    // Direct cell reference for accuracy
    const cellP14 = compSheet['P14']?.v; // FY2025 Actual (25 Total)
    const cellA14 = compSheet['A14']?.v; // Row label for verification

    if (cellP14 && typeof cellP14 === 'number') {
      fy2025Total = cellP14;
      console.log(`   FY2025 Actual from 26 vs 25 Q Comparison (Cell P14): $${(fy2025Total / 1000000).toFixed(3)}M`);
      console.log(`   Row label: "${cellA14}"`);
    } else {
      console.log('   ⚠️ Could not read FY2025 from 26 vs 25 Q Comparison cell P14');
    }
  } else {
    console.log('   ⚠️ Sheet not found: 26 vs 25 Q Comparison');
  }

  // Update burc_annual_financials table
  if (fy2026Total && typeof fy2026Total === 'number') {
    const { error: error2026 } = await supabase
      .from('burc_annual_financials')
      .update({
        gross_revenue: fy2026Total,
        source_file: '2026 APAC Performance.xlsx (APAC BURC sheet, Cell U36)',
        updated_at: new Date().toISOString()
      })
      .eq('fiscal_year', 2026);

    if (error2026) {
      console.error('   ❌ FY2026 update error:', error2026.message);
    } else {
      console.log(`   ✅ FY2026 updated: $${(fy2026Total / 1000000).toFixed(3)}M`);
    }
  }

  if (fy2025Total && typeof fy2025Total === 'number') {
    const { error: error2025 } = await supabase
      .from('burc_annual_financials')
      .update({
        gross_revenue: fy2025Total,
        source_file: '2026 APAC Performance.xlsx (26 vs 25 Q Comparison, Cell P14)',
        updated_at: new Date().toISOString()
      })
      .eq('fiscal_year', 2025);

    if (error2025) {
      console.error('   ❌ FY2025 update error:', error2025.message);
    } else {
      console.log(`   ✅ FY2025 updated: $${(fy2025Total / 1000000).toFixed(3)}M`);
    }
  }
}

async function syncEbitaData(workbook) {
  console.log('📈 Extracting EBITA data...');

  const sheet = workbook.Sheets['APAC BURC - Monthly EBITA'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC - Monthly EBITA');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Find the rows we need
  let baselineRow, actualRow, ebitaPercentRow;
  data.forEach((row, i) => {
    if (row[0] === 'Baseline (Budget)') baselineRow = i;
    if (row[0] === 'Actual' && i < 5) actualRow = i;
    if (row[0] === 'Actual' && i > 5) ebitaPercentRow = i;
  });

  // Delete existing 2026 data
  await supabase.from('burc_ebita_monthly').delete().eq('year', 2026);

  const records = [];
  for (let i = 0; i < 12; i++) {
    const month = MONTHS[i];
    const colIndex = i + 1;

    const target = data[baselineRow]?.[colIndex] || null;
    const actual = data[actualRow]?.[colIndex] || null;
    const ebitaPct = data[ebitaPercentRow]?.[colIndex] || null;

    if (actual !== null || target !== null) {
      const variance = (actual && target) ? actual - target : actual;
      records.push({
        year: 2026,
        month,
        month_num: i + 1,
        target_ebita: target,
        actual_ebita: actual,
        variance,
        ebita_percent: ebitaPct
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_ebita_monthly').insert(records);
    if (error) console.error('   ❌ EBITA insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} months of EBITA data synced`);
}

async function syncQuarterlyComparison(workbook) {
  console.log('📊 Extracting quarterly comparison...');

  const sheet = workbook.Sheets['26 vs 25 Q Comparison'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: 26 vs 25 Q Comparison');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const streams = {
    'License Revenue': 'license',
    'Professional Services Revenue': 'professional_services',
    'Total Maintenance Revenue': 'maintenance',
    'Hardware Revenue': 'hardware',
    'Business Case Revenue': 'business_case',
    'Gross Revenue': 'gross_revenue'
  };

  await supabase.from('burc_quarterly').delete().eq('year', 2026);

  const records = [];
  for (const row of data) {
    const label = row[0];
    if (streams[label]) {
      const streamKey = streams[label];
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

      for (let q = 0; q < 4; q++) {
        const amount = row[3 + q];
        if (amount !== undefined && amount !== null) {
          records.push({
            year: 2026,
            quarter: quarters[q],
            revenue_stream: streamKey,
            amount
          });
        }
      }
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_quarterly').insert(records);
    if (error) console.error('   ❌ Quarterly insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} quarterly entries synced`);
}

async function syncWaterfallData(workbook) {
  console.log('💧 Extracting waterfall data...');

  const sheet = workbook.Sheets['Waterfall Data'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: Waterfall Data');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  await supabase.from('burc_waterfall').delete().neq('category', '');

  const waterfallItems = [
    { row: 1, category: 'backlog_runrate', desc: 'PS Backlog and Maintenance Run Rate Gross Revenue' },
    { row: 4, category: 'committed_gross_rev', desc: 'PS Backlog, Intraco payments and Maint Run Rate' },
    { row: 6, category: 'best_case_ps', desc: 'Best Case Professional Services' },
    { row: 7, category: 'best_case_maint', desc: 'Best Case Maintenance' },
    { row: 8, category: 'other_rev', desc: 'Other Revenue' },
    { row: 9, category: 'pipeline_sw', desc: 'Pipeline Software (not in committed)' },
    { row: 10, category: 'pipeline_ps', desc: 'Pipeline PS (not in committed)' },
    { row: 12, category: 'forecast_cogs', desc: 'Forecast COGS' },
    { row: 13, category: 'cogs_reduction', desc: 'COGS Reduction Target' },
    { row: 15, category: 'forecast_opex', desc: 'Forecast OPEX' },
    { row: 16, category: 'opex_savings', desc: 'OPEX Savings Target' },
    { row: 17, category: 'fx_headwinds', desc: 'FX Headwinds (0.64→0.61)' },
    { row: 19, category: 'target_ebita', desc: 'Target EBITA' },
  ];

  const records = [];
  for (let i = 0; i < waterfallItems.length; i++) {
    const item = waterfallItems[i];
    const amount = data[item.row]?.[1];

    if (amount !== undefined) {
      records.push({
        category: item.category,
        amount,
        description: item.desc,
        sort_order: i + 1
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_waterfall').insert(records);
    if (error) console.error('   ❌ Waterfall insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} waterfall items synced`);
}

async function syncClientMaintenance(workbook) {
  console.log('🏢 Extracting client maintenance revenue...');

  const sheet = workbook.Sheets['Maint Pivot'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: Maint Pivot');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  await supabase.from('burc_client_maintenance').delete().neq('client_code', '');

  let currentCategory = null;
  const records = [];

  const clientNames = {
    'AWH': 'Albury Wodonga Health',
    'BWH': 'Barwon Health',
    'EPH': 'Epworth Healthcare',
    'GHA': 'Grampians Health Alliance',
    'GHRA': 'GHA Regional',
    'MAH': 'Mount Alvernia Hospital',
    'NCS': 'NCS/MinDef',
    'RVEEH': 'Royal Victorian Eye & Ear',
    'SA Health': 'SA Health',
    'WA Health': 'WA Health',
    'SLMC': "St Luke's Medical Centre",
    'Parkway': 'Parkway (Churned)'
  };

  for (const row of data) {
    const firstCol = row[0];

    if (['Run Rate', 'Best Case', 'Best Cast', 'Pipeline', 'Business Case', 'Backlog'].includes(firstCol)) {
      currentCategory = firstCol === 'Best Cast' ? 'Best Case' : firstCol;
      continue;
    }

    if (!firstCol || firstCol === 'Row Labels' || !currentCategory) continue;

    const clientCode = firstCol;
    const clientName = clientNames[clientCode] || clientCode;

    const monthlyValues = [];
    let annualTotal = 0;
    for (let i = 1; i <= 12; i++) {
      const val = row[i] || 0;
      monthlyValues.push(val);
      annualTotal += val;
    }

    if (annualTotal > 0) {
      records.push({
        client_code: clientCode,
        client_name: clientName,
        category: currentCategory,
        jan: monthlyValues[0], feb: monthlyValues[1], mar: monthlyValues[2],
        apr: monthlyValues[3], may: monthlyValues[4], jun: monthlyValues[5],
        jul: monthlyValues[6], aug: monthlyValues[7], sep: monthlyValues[8],
        oct: monthlyValues[9], nov: monthlyValues[10], dec: monthlyValues[11],
        annual_total: annualTotal
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_client_maintenance').insert(records);
    if (error) console.error('   ❌ Client maintenance insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} client maintenance entries synced`);
}

async function syncPsPipeline(workbook) {
  console.log('📋 Extracting PS pipeline...');

  const sheet = workbook.Sheets['PS Pivot'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: PS Pivot');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  await supabase.from('burc_ps_pipeline').delete().neq('client_name', '');

  let currentCategory = null;
  let currentClient = null;
  const records = [];

  for (const row of data) {
    const firstCol = row[0];
    if (!firstCol) continue;

    if (['Backlog', 'Best Case', 'Best Cast', 'Pipeline', 'Business Case', 'Reversal'].includes(firstCol)) {
      currentCategory = firstCol === 'Best Cast' ? 'Best Case' : firstCol;
      currentClient = null;
      continue;
    }

    if (firstCol === 'Row Labels') continue;

    const isProject = firstCol.includes(' ') && !['SA Health', 'WA Health', 'Western Health'].some(c => firstCol.startsWith(c) && firstCol !== c);

    if (!isProject && currentCategory) {
      currentClient = firstCol;
      continue;
    }

    if (currentClient && currentCategory) {
      const projectName = firstCol;

      const monthlyValues = [];
      let annualTotal = 0;
      for (let i = 1; i <= 12; i++) {
        const val = row[i] || 0;
        monthlyValues.push(val);
        annualTotal += val;
      }

      if (annualTotal > 0) {
        records.push({
          client_name: currentClient,
          project_name: projectName,
          category: currentCategory,
          jan: monthlyValues[0], feb: monthlyValues[1], mar: monthlyValues[2],
          apr: monthlyValues[3], may: monthlyValues[4], jun: monthlyValues[5],
          jul: monthlyValues[6], aug: monthlyValues[7], sep: monthlyValues[8],
          oct: monthlyValues[9], nov: monthlyValues[10], dec: monthlyValues[11],
          annual_total: annualTotal
        });
      }
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_ps_pipeline').insert(records);
    if (error) console.error('   ❌ PS pipeline insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} PS pipeline entries synced`);
}

async function syncRevenueStreams(workbook) {
  console.log('💰 Extracting revenue streams summary...');

  const sheet = workbook.Sheets['26 vs 25 Q Comparison'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: 26 vs 25 Q Comparison');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  await supabase.from('burc_revenue_streams').delete().neq('stream', '');

  const streamMappings = [
    { label: 'License Revenue', stream: 'License' },
    { label: 'Professional Services Revenue', stream: 'Professional Services' },
    { label: 'Total Maintenance Revenue', stream: 'Maintenance' },
    { label: 'Hardware Revenue', stream: 'Hardware' },
    { label: 'Business Case Revenue', stream: 'Business Case' },
    { label: 'Gross Revenue', stream: 'Gross Revenue' },
    { label: 'License COGS', stream: 'License COGS' },
  ];

  const records = [];
  for (const row of data) {
    const label = row[0];
    const mapping = streamMappings.find(m => m.label === label);

    if (mapping) {
      const q1 = row[3] || 0;
      const q2 = row[4] || 0;
      const q3 = row[5] || 0;
      const q4 = row[6] || 0;
      const annual = q1 + q2 + q3 + q4;

      records.push({
        stream: mapping.stream,
        category: 'forecast',
        q1, q2, q3, q4,
        annual_total: annual
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_revenue_streams').insert(records);
    if (error) console.error('   ❌ Revenue streams insert error:', error.message);
  }

  console.log(`   ✅ ${records.length} revenue stream entries synced`);
}

// Run
syncBurcData();
