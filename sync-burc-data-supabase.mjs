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
    // All 2026 data comes from APAC BURC sheet (except FY2025 which comes from comparison sheet)
    await syncAnnualFinancials(workbook);  // FY2025/2026 gross revenue
    await syncCSIRatios(workbook);         // CSI ratios from APAC BURC
    await syncEbitaData(workbook);         // EBITA from APAC BURC Row 100-101
    await syncOpexData(workbook);          // OPEX from APAC BURC Rows 71-98
    await syncCogsData(workbook);          // COGS from APAC BURC Rows 38-56
    await syncNetRevenueData(workbook);    // Net Revenue from APAC BURC Rows 58-66
    await syncGrossRevenueMonthly(workbook); // Monthly Gross Revenue from APAC BURC
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

/**
 * Sync CSI Ratios from APAC BURC sheet
 * Source cells (using direct cell references):
 * - Row 122: Customer Service (>4) - maps to maintenance_ratio
 * - Row 123: Sales & Marketing (>1) - maps to sales_ratio
 * - Row 124: R&D (>1) - maps to rd_ratio
 * - Row 125: Professional Services (>2) - maps to ps_ratio
 * - Row 126: Administration <=20% - maps to ga_ratio
 * - Row 127: Core Profitability Ratio >50% - stored as core_profitability
 * Columns: C=Jan, D=Feb, E=Mar, F=Apr, G=May, H=Jun, I=Jul, J=Aug, K=Sep, L=Oct, M=Nov, N=Dec
 */
async function syncCSIRatios(workbook) {
  console.log('📊 Extracting CSI Ratios from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // CSI Ratio row mappings (Excel rows)
  const csiConfig = {
    maintenance_ratio: 122, // Customer Service (>4)
    sales_ratio: 123,       // Sales & Marketing (>1)
    rd_ratio: 124,          // R&D (>1)
    ps_ratio: 125,          // Professional Services (>2)
    ga_ratio: 126,          // Administration <=20%
  };

  // Delete existing 2026 CSI data
  const { error: delError } = await supabase.from('burc_csi_ratios').delete().eq('year', 2026);
  if (delError) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const col = monthCols[monthNum - 1];

    // Get CSI values from direct cell references
    const maintenance = sheet[col + '122']?.v; // Customer Service
    const sales = sheet[col + '123']?.v;       // Sales & Marketing
    const rd = sheet[col + '124']?.v;          // R&D
    const ps = sheet[col + '125']?.v;          // Professional Services
    const ga = sheet[col + '126']?.v;          // Administration

    // Determine status based on targets
    // Values are already as ratios (e.g., 4.6 means 460%, 0.25 means 25%)
    const getStatus = (val, target, isMax = false) => {
      if (val === undefined || val === null) return 'grey';
      if (isMax) return val <= target ? 'green' : 'red';
      return val >= target ? 'green' : 'red';
    };

    records.push({
      year: 2026,
      month_num: monthNum,
      // Store as multiplier values (e.g., 4.6 for 460%)
      maintenance_ratio: maintenance ?? null,
      sales_ratio: sales ?? null,
      rd_ratio: rd ?? null,
      ps_ratio: ps ?? null,
      ga_ratio: ga ?? null,
      // Status based on targets
      maintenance_status: getStatus(maintenance, 4),      // >4
      sales_status: getStatus(sales, 1),                   // >1
      rd_status: getStatus(rd, 1),                         // >1
      ps_status: getStatus(ps, 2),                         // >2
      ga_status: getStatus(ga, 0.20, true),               // <=20%
      calculated_at: new Date().toISOString()
    });
  }

  // Insert new records
  const { error: insertError } = await supabase.from('burc_csi_ratios').insert(records);
  if (insertError) {
    console.error('   ❌ CSI insert error:', insertError.message);
  } else {
    // Show sample values
    const sample = records[0];
    console.log(`   Jan 2026: Maint=${(sample.maintenance_ratio * 100).toFixed(1)}% PS=${(sample.ps_ratio * 100).toFixed(1)}% Sales=${(sample.sales_ratio * 100).toFixed(1)}% R&D=${(sample.rd_ratio * 100).toFixed(1)}% G&A=${(sample.ga_ratio * 100).toFixed(1)}%`);
    console.log(`   ✅ 12 months of CSI ratios synced`);
  }
}

/**
 * Sync EBITA data from APAC BURC sheet
 * Source cells (direct cell references):
 * - Row 100: EBITA values (Actual and Forecast)
 * - Row 101: EBITA as % of Net Revenue
 * Columns: C=Jan, D=Feb, E=Mar, F=Apr, G=May, H=Jun, I=Jul, J=Aug, K=Sep, L=Oct, M=Nov, N=Dec
 * Column U = FY2026 Forecast Total, Column W = FY2026 Target/Budget
 */
async function syncEbitaData(workbook) {
  console.log('📈 Extracting EBITA data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // Get annual target from cell W100 (Budget/Target)
  const annualTarget = sheet['W100']?.v;
  const monthlyTarget = annualTarget ? annualTarget / 12 : null;

  // Delete existing 2026 data
  await supabase.from('burc_ebita_monthly').delete().eq('year', 2026);

  const records = [];
  for (let i = 0; i < 12; i++) {
    const month = MONTHS[i];
    const col = monthCols[i];

    // Direct cell references
    const actual = sheet[col + '100']?.v;      // EBITA value
    const ebitaPct = sheet[col + '101']?.v;    // EBITA as % of Net Revenue

    if (actual !== null && actual !== undefined) {
      const variance = monthlyTarget ? actual - monthlyTarget : actual;
      records.push({
        year: 2026,
        month,
        month_num: i + 1,
        target_ebita: monthlyTarget,
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

  // Show sample values
  if (records.length > 0) {
    const sample = records[0];
    console.log(`   Jan 2026: EBITA=$${(sample.actual_ebita / 1000).toFixed(0)}K (${((sample.ebita_percent || 0) * 100).toFixed(1)}% margin)`);
  }
  console.log(`   ✅ ${records.length} months of EBITA data synced`);
}

/**
 * Sync OPEX data from APAC BURC sheet
 * Source rows:
 * - Row 71: CS (Customer Service) OPEX
 * - Row 76: R&D OPEX
 * - Row 82: PS (Professional Services) OPEX
 * - Row 88: Sales & Marketing OPEX
 * - Row 95: G&A (General & Administrative) OPEX
 * - Row 98: Total OPEX
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncOpexData(workbook) {
  console.log('💼 Extracting OPEX data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // OPEX category row mappings
  const opexConfig = {
    cs_opex: 71,        // Customer Service
    rd_opex: 76,        // R&D
    ps_opex: 82,        // Professional Services
    sales_opex: 88,     // Sales & Marketing
    ga_opex: 95,        // General & Administrative
    total_opex: 98,     // Total OPEX
  };

  // Delete existing 2026 OPEX data
  const { error: delError } = await supabase.from('burc_opex_monthly').delete().eq('year', 2026);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const col = monthCols[monthNum - 1];

    // Get OPEX values from direct cell references
    const cs = sheet[col + '71']?.v;
    const rd = sheet[col + '76']?.v;
    const ps = sheet[col + '82']?.v;
    const sales = sheet[col + '88']?.v;
    const ga = sheet[col + '95']?.v;
    const total = sheet[col + '98']?.v;

    records.push({
      year: 2026,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      cs_opex: cs ?? null,
      rd_opex: rd ?? null,
      ps_opex: ps ?? null,
      sales_opex: sales ?? null,
      ga_opex: ga ?? null,
      total_opex: total ?? null,
      calculated_at: new Date().toISOString()
    });
  }

  // Insert new records (check if table exists first)
  const { error: insertError } = await supabase.from('burc_opex_monthly').insert(records);
  if (insertError) {
    if (insertError.message.includes('does not exist')) {
      console.log('   ℹ️ Table burc_opex_monthly does not exist - skipping');
    } else {
      console.error('   ❌ OPEX insert error:', insertError.message);
    }
  } else {
    const sample = records[0];
    console.log(`   Jan 2026: Total OPEX=$${((sample.total_opex || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of OPEX data synced`);
  }
}

/**
 * Sync COGS data from APAC BURC sheet
 * Source rows:
 * - Row 38: License COGS
 * - Row 40: PS COGS
 * - Row 44: Maintenance COGS
 * - Row 47: Hardware COGS
 * - Row 56: Total COGS
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncCogsData(workbook) {
  console.log('📦 Extracting COGS data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // Delete existing 2026 COGS data
  const { error: delError } = await supabase.from('burc_cogs_monthly').delete().eq('year', 2026);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const col = monthCols[monthNum - 1];

    // Get COGS values from direct cell references
    const license = sheet[col + '38']?.v;
    const ps = sheet[col + '40']?.v;
    const maintenance = sheet[col + '44']?.v;
    const hardware = sheet[col + '47']?.v;
    const total = sheet[col + '56']?.v;

    records.push({
      year: 2026,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_cogs: license ?? null,
      ps_cogs: ps ?? null,
      maintenance_cogs: maintenance ?? null,
      hardware_cogs: hardware ?? null,
      total_cogs: total ?? null,
      calculated_at: new Date().toISOString()
    });
  }

  // Insert new records
  const { error: insertError } = await supabase.from('burc_cogs_monthly').insert(records);
  if (insertError) {
    if (insertError.message.includes('does not exist')) {
      console.log('   ℹ️ Table burc_cogs_monthly does not exist - skipping');
    } else {
      console.error('   ❌ COGS insert error:', insertError.message);
    }
  } else {
    const sample = records[0];
    console.log(`   Jan 2026: Total COGS=$${((sample.total_cogs || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of COGS data synced`);
  }
}

/**
 * Sync Net Revenue data from APAC BURC sheet
 * Net Revenue = Gross Revenue - COGS
 * Source rows (estimated):
 * - Row 58-66: Net Revenue by type
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncNetRevenueData(workbook) {
  console.log('💵 Extracting Net Revenue data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // Delete existing 2026 Net Revenue data
  const { error: delError } = await supabase.from('burc_net_revenue_monthly').delete().eq('year', 2026);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const col = monthCols[monthNum - 1];

    // Get Net Revenue values (Total Net Revenue at row 66)
    const license = sheet[col + '58']?.v;
    const ps = sheet[col + '60']?.v;
    const maintenance = sheet[col + '63']?.v;
    const hardware = sheet[col + '65']?.v;
    const total = sheet[col + '66']?.v;

    records.push({
      year: 2026,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_net: license ?? null,
      ps_net: ps ?? null,
      maintenance_net: maintenance ?? null,
      hardware_net: hardware ?? null,
      total_net_revenue: total ?? null,
      calculated_at: new Date().toISOString()
    });
  }

  // Insert new records
  const { error: insertError } = await supabase.from('burc_net_revenue_monthly').insert(records);
  if (insertError) {
    if (insertError.message.includes('does not exist')) {
      console.log('   ℹ️ Table burc_net_revenue_monthly does not exist - skipping');
    } else {
      console.error('   ❌ Net Revenue insert error:', insertError.message);
    }
  } else {
    const sample = records[0];
    console.log(`   Jan 2026: Total Net Revenue=$${((sample.total_net_revenue || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of Net Revenue data synced`);
  }
}

/**
 * Sync Monthly Gross Revenue from APAC BURC sheet
 * Source rows:
 * - Row 28: License Revenue
 * - Row 30: PS Revenue
 * - Row 33: Maintenance Revenue
 * - Row 35: Hardware Revenue
 * - Row 36: Total Gross Revenue
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncGrossRevenueMonthly(workbook) {
  console.log('💰 Extracting Monthly Gross Revenue from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Column mapping: C=Jan(1), D=Feb(2), ..., N=Dec(12)
  const monthCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // Delete existing 2026 monthly revenue data
  const { error: delError } = await supabase.from('burc_gross_revenue_monthly').delete().eq('year', 2026);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const col = monthCols[monthNum - 1];

    // Get revenue values from direct cell references
    const license = sheet[col + '28']?.v;
    const ps = sheet[col + '30']?.v;
    const maintenance = sheet[col + '33']?.v;
    const hardware = sheet[col + '35']?.v;
    const total = sheet[col + '36']?.v;

    records.push({
      year: 2026,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_revenue: license ?? null,
      ps_revenue: ps ?? null,
      maintenance_revenue: maintenance ?? null,
      hardware_revenue: hardware ?? null,
      total_gross_revenue: total ?? null,
      calculated_at: new Date().toISOString()
    });
  }

  // Insert new records
  const { error: insertError } = await supabase.from('burc_gross_revenue_monthly').insert(records);
  if (insertError) {
    if (insertError.message.includes('does not exist')) {
      console.log('   ℹ️ Table burc_gross_revenue_monthly does not exist - skipping');
    } else {
      console.error('   ❌ Gross Revenue insert error:', insertError.message);
    }
  } else {
    const sample = records[0];
    console.log(`   Jan 2026: Total Gross Revenue=$${((sample.total_gross_revenue || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of Gross Revenue data synced`);
  }
}

/**
 * Sync Quarterly Comparison from APAC BURC sheet for 2026 data
 * Source rows (using direct cell references):
 * - Row 28: License Revenue
 * - Row 30: PS Revenue
 * - Row 33: Maintenance Revenue
 * - Row 35: Hardware Revenue
 * - Row 36: Total Gross Revenue
 * Columns: C-E=Q1, F-H=Q2, I-K=Q3, L-N=Q4
 */
async function syncQuarterlyComparison(workbook) {
  console.log('📊 Extracting quarterly comparison from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Helper to sum quarterly values from monthly cells
  const getQuarterlySum = (row, qCols) => {
    let sum = 0;
    for (const col of qCols) {
      const val = sheet[col + row]?.v;
      if (typeof val === 'number') sum += val;
    }
    return sum;
  };

  // Quarter column mappings
  const q1Cols = ['C', 'D', 'E'];  // Jan, Feb, Mar
  const q2Cols = ['F', 'G', 'H'];  // Apr, May, Jun
  const q3Cols = ['I', 'J', 'K'];  // Jul, Aug, Sep
  const q4Cols = ['L', 'M', 'N'];  // Oct, Nov, Dec

  // Revenue stream row mappings
  const streamMappings = [
    { row: 28, stream: 'license' },
    { row: 30, stream: 'professional_services' },
    { row: 33, stream: 'maintenance' },
    { row: 35, stream: 'hardware' },
    { row: 36, stream: 'gross_revenue' },
  ];

  await supabase.from('burc_quarterly').delete().eq('year', 2026);

  const records = [];
  const quarters = [
    { name: 'Q1', cols: q1Cols },
    { name: 'Q2', cols: q2Cols },
    { name: 'Q3', cols: q3Cols },
    { name: 'Q4', cols: q4Cols },
  ];

  for (const mapping of streamMappings) {
    for (const quarter of quarters) {
      const amount = getQuarterlySum(mapping.row, quarter.cols);
      if (amount !== 0) {
        records.push({
          year: 2026,
          quarter: quarter.name,
          revenue_stream: mapping.stream,
          amount
        });
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

/**
 * Sync Revenue Streams from APAC BURC sheet
 * Source rows (using direct cell references):
 * - Row 28: License Revenue
 * - Row 30: PS Revenue
 * - Row 33: Maintenance Revenue
 * - Row 35: Hardware Revenue
 * - Row 36: Total Gross Revenue
 * Columns: C-E=Q1, F-H=Q2, I-K=Q3, L-N=Q4, U=FY2026 Forecast
 */
async function syncRevenueStreams(workbook) {
  console.log('💰 Extracting revenue streams from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Helper to sum quarterly values from monthly cells
  const getQuarterlySum = (row, qCols) => {
    let sum = 0;
    for (const col of qCols) {
      const val = sheet[col + row]?.v;
      if (typeof val === 'number') sum += val;
    }
    return sum;
  };

  // Quarter column mappings
  const q1Cols = ['C', 'D', 'E'];  // Jan, Feb, Mar
  const q2Cols = ['F', 'G', 'H'];  // Apr, May, Jun
  const q3Cols = ['I', 'J', 'K'];  // Jul, Aug, Sep
  const q4Cols = ['L', 'M', 'N'];  // Oct, Nov, Dec

  // Revenue stream row mappings
  const streamMappings = [
    { row: 28, stream: 'License' },
    { row: 30, stream: 'Professional Services' },
    { row: 33, stream: 'Maintenance' },
    { row: 35, stream: 'Hardware' },
    { row: 36, stream: 'Gross Revenue' },
    { row: 38, stream: 'License COGS' },
  ];

  await supabase.from('burc_revenue_streams').delete().neq('stream', '');

  const records = [];
  for (const mapping of streamMappings) {
    const q1 = getQuarterlySum(mapping.row, q1Cols);
    const q2 = getQuarterlySum(mapping.row, q2Cols);
    const q3 = getQuarterlySum(mapping.row, q3Cols);
    const q4 = getQuarterlySum(mapping.row, q4Cols);
    const annual = sheet['U' + mapping.row]?.v || (q1 + q2 + q3 + q4);

    records.push({
      stream: mapping.stream,
      category: 'forecast',
      q1, q2, q3, q4,
      annual_total: annual
    });
  }

  if (records.length > 0) {
    const { error } = await supabase.from('burc_revenue_streams').insert(records);
    if (error) console.error('   ❌ Revenue streams insert error:', error.message);
  }

  // Show sample
  const grossRev = records.find(r => r.stream === 'Gross Revenue');
  if (grossRev) {
    console.log(`   FY2026 Gross Revenue: $${(grossRev.annual_total / 1000000).toFixed(3)}M`);
  }
  console.log(`   ✅ ${records.length} revenue stream entries synced`);
}

// Run
syncBurcData();
