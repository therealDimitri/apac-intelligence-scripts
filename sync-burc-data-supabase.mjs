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
import { BURC_MASTER_FILE, FISCAL_YEAR, PREV_FISCAL_YEAR, requireOneDrive } from './lib/onedrive-paths.mjs'
import { findRows, getCellValue, requireCell, readMonthlyRow, validateCellRefs } from './lib/excel-utils.mjs'
import { BURC_CLIENT_NAMES } from './lib/client-names.mjs'
import { createSyncLogger } from './lib/sync-logger.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BURC_PATH = BURC_MASTER_FILE;
const FY_SHORT = String(FISCAL_YEAR).slice(-2);
const PREV_FY_SHORT = String(PREV_FISCAL_YEAR).slice(-2);
const COMP_SHEET_NAME = `${FY_SHORT} vs ${PREV_FY_SHORT} Q Comparison`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function syncBurcData() {
  console.log('📊 Syncing BURC data from Excel file...');
  console.log(`   File: ${BURC_PATH}\n`);

  const syncLog = await createSyncLogger(supabase, 'burc_sync', 'cron');

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
    // All FY data comes from APAC BURC sheet (except prior year from comparison sheet)
    await syncAnnualFinancials(workbook);  // FY gross revenue
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

    // Log sync to both legacy table and unified sync_history
    await supabase.from('burc_sync_log').insert({
      synced_at: new Date().toISOString(),
      file_path: BURC_PATH,
      status: 'success'
    });

    syncLog.addProcessed(12); // 12 sync functions ran
    await syncLog.complete({ file: BURC_PATH, fiscalYear: FISCAL_YEAR });

    console.log('\n✅ BURC data synced successfully!');
    console.log(`   Last sync: ${new Date().toISOString()}`);

  } catch (err) {
    await syncLog.fail(err);
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

/**
 * Sync Annual Financials from multiple sheets using direct cell references.
 * See docs/burc-cell-mapping.md for the full cell reference map.
 *
 * Forecasts (Column U): U36 (Gross Revenue), U60 (Maintenance ARR), U101 (EBITA)
 * Targets (Column W): W36, W60, W101
 * Prior year: Comparison sheet Cell P14
 */
async function syncAnnualFinancials(workbook) {
  console.log(`💵 Extracting FY${FISCAL_YEAR} Annual Financials (using direct cell references)...`);

  let fyGrossRevenue = null;
  let fyTargetGrossRevenue = null;
  let fyTargetArr = null;
  let fyTargetEbita = null;
  let prevFyTotal = null;

  // === Current FY: From APAC BURC sheet ===
  const apacSheet = workbook.Sheets['APAC BURC'];
  if (apacSheet) {
    // Find rows by label — survives row insertions/deletions
    const rows = findRows(apacSheet, 'A', [
      { key: 'grossRevenue', pattern: /^Gross Revenue/i },
      { key: 'maintenanceArr', pattern: /^Ending ARR|^Maintenance.*ARR/i },
      { key: 'ebita', pattern: /^EBITA$/i },
    ], 'APAC BURC');

    // Read forecast (Column U) and target (Column W) from discovered rows
    const cellU_gr = requireCell(apacSheet, `U${rows.grossRevenue}`, 'Gross Revenue Forecast');
    const cellW_gr = getCellValue(apacSheet, `W${rows.grossRevenue}`);
    const labelGr = getCellValue(apacSheet, `A${rows.grossRevenue}`, 'Gross Revenue');

    const cellU_arr = requireCell(apacSheet, `U${rows.maintenanceArr}`, 'Maintenance ARR Forecast');
    const cellW_arr = getCellValue(apacSheet, `W${rows.maintenanceArr}`);
    const labelArr = getCellValue(apacSheet, `A${rows.maintenanceArr}`, 'Maintenance ARR');

    const cellU_eb = requireCell(apacSheet, `U${rows.ebita}`, 'EBITA Forecast');
    const cellW_eb = getCellValue(apacSheet, `W${rows.ebita}`);
    const labelEb = getCellValue(apacSheet, `A${rows.ebita}`, 'EBITA');

    console.log(`   Row discovery: Gross Revenue=row ${rows.grossRevenue}, ARR=row ${rows.maintenanceArr}, EBITA=row ${rows.ebita}`);

    if (typeof cellU_gr === 'number') {
      fyGrossRevenue = cellU_gr;
      fyTargetGrossRevenue = typeof cellW_gr === 'number' ? cellW_gr : null;
      console.log(`   Gross Revenue (${labelGr}):`);
      console.log(`     Forecast: $${(fyGrossRevenue / 1000000).toFixed(3)}M`);
      console.log(`     Target:   $${(fyTargetGrossRevenue / 1000000).toFixed(3)}M`);
    }

    if (cellW_arr && typeof cellW_arr === 'number') {
      fyTargetArr = cellW_arr;
      console.log(`   Maintenance ARR (${labelArr}):`);
      console.log(`     Forecast: $${(cellU_arr / 1000000).toFixed(3)}M`);
      console.log(`     Target:   $${(fyTargetArr / 1000000).toFixed(3)}M`);
    }

    if (cellW_eb && typeof cellW_eb === 'number') {
      fyTargetEbita = cellW_eb;
      console.log(`   EBITA (${labelEb}):`);
      console.log(`     Forecast: $${(cellU_eb / 1000000).toFixed(3)}M`);
      console.log(`     Target:   $${(fyTargetEbita / 1000000).toFixed(3)}M`);
    }
  } else {
    console.log('   ⚠️ Sheet not found: APAC BURC');
  }

  // === Prior FY: From comparison sheet, Row 14 ===
  const compSheet = workbook.Sheets[COMP_SHEET_NAME];
  if (compSheet) {
    const cellP14 = getCellValue(compSheet, 'P14');
    const cellA14 = getCellValue(compSheet, 'A14', 'Prior FY');

    if (cellP14 && typeof cellP14 === 'number') {
      prevFyTotal = cellP14;
      console.log(`   FY${PREV_FISCAL_YEAR} Actual (${cellA14}): $${(prevFyTotal / 1000000).toFixed(3)}M`);
    }
  }

  // Get current ending_arr to calculate variance
  const { data: currentData } = await supabase
    .from('burc_annual_financials')
    .select('ending_arr')
    .eq('fiscal_year', FISCAL_YEAR)
    .single();

  const endingArr = currentData?.ending_arr || 0;

  // Calculate ARR variance and risk status
  let arrVariancePercent = null;
  let arrRiskStatus = 'Unknown';

  if (fyTargetArr && endingArr) {
    arrVariancePercent = ((endingArr - fyTargetArr) / fyTargetArr) * 100;

    if (arrVariancePercent >= 0) {
      arrRiskStatus = 'On Track';
    } else if (arrVariancePercent >= -5) {
      arrRiskStatus = 'At Risk';
    } else {
      arrRiskStatus = 'Critical';
    }

    console.log(`   ARR Variance: ${arrVariancePercent.toFixed(1)}% (${arrRiskStatus})`);
  }

  // Update burc_annual_financials table for current FY
  if (fyGrossRevenue) {
    const updatePayload = {
      gross_revenue: fyGrossRevenue,
      target_gross_revenue: fyTargetGrossRevenue,
      target_arr: fyTargetArr,
      target_ebita: fyTargetEbita,
      arr_variance_percent: arrVariancePercent,
      arr_risk_status: arrRiskStatus,
      source_file: `${FISCAL_YEAR} APAC Performance.xlsx (APAC BURC sheet)`,
      updated_at: new Date().toISOString()
    };

    const { error: errorFy } = await supabase
      .from('burc_annual_financials')
      .update(updatePayload)
      .eq('fiscal_year', FISCAL_YEAR);

    if (errorFy) {
      console.error(`   ❌ FY${FISCAL_YEAR} update error:`, errorFy.message);
    } else {
      console.log(`   ✅ FY${FISCAL_YEAR} updated with forecasts and targets`);
    }
  }

  // Update prior FY
  if (prevFyTotal && typeof prevFyTotal === 'number') {
    const { error: errorPrevFy } = await supabase
      .from('burc_annual_financials')
      .update({
        gross_revenue: prevFyTotal,
        source_file: `${FISCAL_YEAR} APAC Performance.xlsx (${COMP_SHEET_NAME}, Cell P14)`,
        updated_at: new Date().toISOString()
      })
      .eq('fiscal_year', PREV_FISCAL_YEAR);

    if (errorPrevFy) {
      console.error(`   ❌ FY${PREV_FISCAL_YEAR} update error:`, errorPrevFy.message);
    } else {
      console.log(`   ✅ FY${PREV_FISCAL_YEAR} updated: $${(prevFyTotal / 1000000).toFixed(3)}M`);
    }
  }
}

/**
 * Sync CSI Ratios from APAC BURC sheet
 * Source cells (using direct cell references):
 * - Row 123: Customer Service (>4) - maps to maintenance_ratio
 * - Row 124: Sales & Marketing (>1) - maps to sales_ratio
 * - Row 125: R&D (>1) - maps to rd_ratio
 * - Row 126: Professional Services (>2) - maps to ps_ratio
 * - Row 127: Administration <=20% - maps to ga_ratio
 * - Row 128: Core Profitability Ratio >50% - stored as core_profitability
 * Columns: C=Jan, D=Feb, E=Mar, F=Apr, G=May, H=Jun, I=Jul, J=Aug, K=Sep, L=Oct, M=Nov, N=Dec
 */
async function syncCSIRatios(workbook) {
  console.log('📊 Extracting CSI Ratios from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // CSI Ratio row mappings (Excel rows)
  const csiConfig = {
    maintenance_ratio: 123, // Customer Service (>4)
    sales_ratio: 124,       // Sales & Marketing (>1)
    rd_ratio: 125,          // R&D (>1)
    ps_ratio: 126,          // Professional Services (>2)
    ga_ratio: 127,          // Administration <=20%
  };

  // Pre-flight: validate critical CSI rows exist
  validateCellRefs(sheet, 'APAC BURC', [
    { ref: 'A123', label: 'Customer Service ratio label' },
    { ref: 'A124', label: 'Sales & Marketing ratio label' },
    { ref: 'A125', label: 'R&D ratio label' },
    { ref: 'A126', label: 'PS ratio label' },
    { ref: 'A127', label: 'Administration ratio label' },
  ]);

  // Read monthly values for each CSI row
  const maintRow = readMonthlyRow(sheet, csiConfig.maintenance_ratio);
  const salesRow = readMonthlyRow(sheet, csiConfig.sales_ratio);
  const rdRow = readMonthlyRow(sheet, csiConfig.rd_ratio);
  const psRow = readMonthlyRow(sheet, csiConfig.ps_ratio);
  const gaRow = readMonthlyRow(sheet, csiConfig.ga_ratio);

  // Delete existing FY CSI data
  const { error: delError } = await supabase.from('burc_csi_ratios').delete().eq('year', FISCAL_YEAR);
  if (delError) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const maintenance = maintRow[monthNum - 1];
    const sales = salesRow[monthNum - 1];
    const rd = rdRow[monthNum - 1];
    const ps = psRow[monthNum - 1];
    const ga = gaRow[monthNum - 1];

    // Determine status based on targets
    // Values are already as ratios (e.g., 4.6 means 460%, 0.25 means 25%)
    const getStatus = (val, target, isMax = false) => {
      if (val === undefined || val === null) return 'grey';
      if (isMax) return val <= target ? 'green' : 'red';
      return val >= target ? 'green' : 'red';
    };

    records.push({
      year: FISCAL_YEAR,
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
    console.log(`   Jan ${FISCAL_YEAR}: Maint=${(sample.maintenance_ratio * 100).toFixed(1)}% PS=${(sample.ps_ratio * 100).toFixed(1)}% Sales=${(sample.sales_ratio * 100).toFixed(1)}% R&D=${(sample.rd_ratio * 100).toFixed(1)}% G&A=${(sample.ga_ratio * 100).toFixed(1)}%`);
    console.log(`   ✅ 12 months of CSI ratios synced`);
  }
}

/**
 * Sync EBITA data from APAC BURC sheet
 * Source cells (direct cell references):
 * - Row 101: EBITA values (Actual and Forecast)
 * - Row 102: EBITA as % of Net Revenue
 * Columns: C=Jan, D=Feb, E=Mar, F=Apr, G=May, H=Jun, I=Jul, J=Aug, K=Sep, L=Oct, M=Nov, N=Dec
 * Column U = FY Forecast Total, Column W = FY Target/Budget
 */
async function syncEbitaData(workbook) {
  console.log('📈 Extracting EBITA data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Get annual target from cell W101 (Budget/Target)
  const annualTarget = getCellValue(sheet, 'W101');
  const monthlyTarget = annualTarget ? annualTarget / 12 : null;

  // Read monthly EBITA values using readMonthlyRow
  const ebitaValues = readMonthlyRow(sheet, 101);
  const ebitaPctValues = readMonthlyRow(sheet, 102);

  // Delete existing FY data
  await supabase.from('burc_ebita_monthly').delete().eq('year', FISCAL_YEAR);

  const records = [];
  for (let i = 0; i < 12; i++) {
    const month = MONTHS[i];

    const actual = ebitaValues[i];
    const ebitaPct = ebitaPctValues[i];

    if (actual !== null && actual !== undefined) {
      const variance = monthlyTarget ? actual - monthlyTarget : actual;
      records.push({
        year: FISCAL_YEAR,
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
    console.log(`   Jan ${FISCAL_YEAR}: EBITA=$${(sample.actual_ebita / 1000).toFixed(0)}K (${((sample.ebita_percent || 0) * 100).toFixed(1)}% margin)`);
  }
  console.log(`   ✅ ${records.length} months of EBITA data synced`);
}

/**
 * Sync OPEX data from APAC BURC sheet
 * Source rows:
 * - Row 71: Professional Services (less Depr) OPEX
 * - Row 76: Maintenance (less Depr) OPEX
 * - Row 83: Sales & Marketing (less Depr) OPEX
 * - Row 89: R&D (less Depr) OPEX
 * - Row 96: G&A (less Depr) OPEX
 * - Row 99: Total OPEX
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncOpexData(workbook) {
  console.log('💼 Extracting OPEX data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // OPEX category row mappings
  const opexConfig = {
    cs_opex: 71,        // Professional Services (less Depr) OPEX
    rd_opex: 76,        // Maintenance (less Depr) OPEX
    ps_opex: 83,        // Sales & Marketing (less Depr) OPEX
    sales_opex: 89,     // R&D (less Depr) OPEX
    ga_opex: 96,        // G&A (less Depr) OPEX
    total_opex: 99,     // Total OPEX
  };

  // Read monthly values for each OPEX category
  const csRow = readMonthlyRow(sheet, opexConfig.cs_opex);
  const rdRow = readMonthlyRow(sheet, opexConfig.rd_opex);
  const psRow = readMonthlyRow(sheet, opexConfig.ps_opex);
  const salesRow = readMonthlyRow(sheet, opexConfig.sales_opex);
  const gaRow = readMonthlyRow(sheet, opexConfig.ga_opex);
  const totalRow = readMonthlyRow(sheet, opexConfig.total_opex);

  // Delete existing FY OPEX data
  const { error: delError } = await supabase.from('burc_opex_monthly').delete().eq('year', FISCAL_YEAR);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    records.push({
      year: FISCAL_YEAR,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      cs_opex: csRow[monthNum - 1],
      rd_opex: rdRow[monthNum - 1],
      ps_opex: psRow[monthNum - 1],
      sales_opex: salesRow[monthNum - 1],
      ga_opex: gaRow[monthNum - 1],
      total_opex: totalRow[monthNum - 1],
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
    console.log(`   Jan ${FISCAL_YEAR}: Total OPEX=$${((sample.total_opex || 0) / 1000).toFixed(0)}K`);
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

  // Delete existing FY COGS data
  const { error: delError } = await supabase.from('burc_cogs_monthly').delete().eq('year', FISCAL_YEAR);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  // Read monthly values for each COGS category
  const licenseRow = readMonthlyRow(sheet, 38);
  const psRow = readMonthlyRow(sheet, 40);
  const maintRow = readMonthlyRow(sheet, 44);
  const hwRow = readMonthlyRow(sheet, 47);
  const totalRow = readMonthlyRow(sheet, 56);

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    records.push({
      year: FISCAL_YEAR,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_cogs: licenseRow[monthNum - 1],
      ps_cogs: psRow[monthNum - 1],
      maintenance_cogs: maintRow[monthNum - 1],
      hardware_cogs: hwRow[monthNum - 1],
      total_cogs: totalRow[monthNum - 1],
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
    console.log(`   Jan ${FISCAL_YEAR}: Total COGS=$${((sample.total_cogs || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of COGS data synced`);
  }
}

/**
 * Sync Net Revenue data from APAC BURC sheet
 * Net Revenue = Gross Revenue - COGS
 * Source rows (estimated):
 * - Rows 58-66: Net Revenue by type (License=58, PS=59, Maint=60, HW=61, Total=66)
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncNetRevenueData(workbook) {
  console.log('💵 Extracting Net Revenue data from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Delete existing FY Net Revenue data
  const { error: delError } = await supabase.from('burc_net_revenue_monthly').delete().eq('year', FISCAL_YEAR);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  // Read monthly values for each Net Revenue category
  const licenseRow = readMonthlyRow(sheet, 58);    // License NR
  const psRow = readMonthlyRow(sheet, 59);          // Professional Service NR
  const maintRow = readMonthlyRow(sheet, 60);       // Maintenance NR (ARR)
  const hwRow = readMonthlyRow(sheet, 61);          // Hardware & Other NR
  const totalRow = readMonthlyRow(sheet, 66);       // Net Revenue Excluding Pipeline

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    records.push({
      year: FISCAL_YEAR,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_net: licenseRow[monthNum - 1],
      ps_net: psRow[monthNum - 1],
      maintenance_net: maintRow[monthNum - 1],
      hardware_net: hwRow[monthNum - 1],
      total_net_revenue: totalRow[monthNum - 1],
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
    console.log(`   Jan ${FISCAL_YEAR}: Total Net Revenue=$${((sample.total_net_revenue || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of Net Revenue data synced`);
  }
}

/**
 * Sync Monthly Gross Revenue from APAC BURC sheet
 * Source rows:
 * - Row 10: Gross License Revenue
 * - Row 12: Gross Professional Services Revenue
 * - Row 18: Gross Maintenance Revenue
 * - Row 27: Gross Hardware
 * - Row 36: Gross Revenue Total
 * Columns: C=Jan, D=Feb, E=Mar, ..., N=Dec
 */
async function syncGrossRevenueMonthly(workbook) {
  console.log('💰 Extracting Monthly Gross Revenue from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Delete existing FY monthly revenue data
  const { error: delError } = await supabase.from('burc_gross_revenue_monthly').delete().eq('year', FISCAL_YEAR);
  if (delError && !delError.message.includes('does not exist')) {
    console.log('   ⚠️ Delete error:', delError.message);
  }

  // Read monthly values for each revenue category
  const licenseRow = readMonthlyRow(sheet, 10);    // Gross License Revenue
  const psRow = readMonthlyRow(sheet, 12);          // Gross Professional Services Revenue
  const maintRow = readMonthlyRow(sheet, 18);       // Gross Maintenance Revenue
  const hwRow = readMonthlyRow(sheet, 27);          // Gross Hardware
  const totalRow = readMonthlyRow(sheet, 36);       // Gross Revenue Total

  const records = [];
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    records.push({
      year: FISCAL_YEAR,
      month: MONTHS[monthNum - 1],
      month_num: monthNum,
      license_revenue: licenseRow[monthNum - 1],
      ps_revenue: psRow[monthNum - 1],
      maintenance_revenue: maintRow[monthNum - 1],
      hardware_revenue: hwRow[monthNum - 1],
      total_gross_revenue: totalRow[monthNum - 1],
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
    console.log(`   Jan ${FISCAL_YEAR}: Total Gross Revenue=$${((sample.total_gross_revenue || 0) / 1000).toFixed(0)}K`);
    console.log(`   ✅ 12 months of Gross Revenue data synced`);
  }
}

/**
 * Sync Quarterly Comparison from APAC BURC sheet for current FY data
 * Source rows (using direct cell references):
 * - Row 10: Gross License Revenue
 * - Row 12: Gross Professional Services Revenue
 * - Row 18: Gross Maintenance Revenue
 * - Row 27: Gross Hardware
 * - Row 36: Gross Revenue Total
 * Columns: C-E=Q1, F-H=Q2, I-K=Q3, L-N=Q4
 */
async function syncQuarterlyComparison(workbook) {
  console.log('📊 Extracting quarterly comparison from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Revenue stream row mappings
  const streamMappings = [
    { row: 10, stream: 'license' },
    { row: 12, stream: 'professional_services' },
    { row: 18, stream: 'maintenance' },
    { row: 27, stream: 'hardware' },
    { row: 36, stream: 'gross_revenue' },
  ];

  await supabase.from('burc_quarterly').delete().eq('year', FISCAL_YEAR);

  const records = [];
  const quarters = [
    { name: 'Q1', months: [0, 1, 2] },
    { name: 'Q2', months: [3, 4, 5] },
    { name: 'Q3', months: [6, 7, 8] },
    { name: 'Q4', months: [9, 10, 11] },
  ];

  for (const mapping of streamMappings) {
    const monthlyValues = readMonthlyRow(sheet, mapping.row);
    for (const quarter of quarters) {
      const amount = quarter.months.reduce((sum, i) => sum + (typeof monthlyValues[i] === 'number' ? monthlyValues[i] : 0), 0);
      if (amount !== 0) {
        records.push({
          year: FISCAL_YEAR,
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

  // Delete existing records - use a condition that matches all records
  const { error: deleteError } = await supabase
    .from('burc_client_maintenance')
    .delete()
    .not('client_code', 'is', null);

  if (deleteError) {
    console.log('   ⚠️ Delete error:', deleteError.message);
  }

  let currentCategory = null;
  const records = [];

  // Known client codes — imported from shared canonical source
  // Child rows (like "Run Rate 25/26", "CPI - 5%") are detail breakdowns and should be skipped
  const clientNames = BURC_CLIENT_NAMES;

  // Track seen combinations to handle any remaining duplicates
  const seen = new Set();

  for (const row of data) {
    const firstCol = row[0];

    // Detect category headers
    if (['Run Rate', 'Best Case', 'Best Cast', 'Pipeline', 'Business Case', 'Backlog'].includes(firstCol)) {
      currentCategory = firstCol === 'Best Cast' ? 'Best Case' : firstCol;
      continue;
    }

    if (!firstCol || firstCol === 'Row Labels' || !currentCategory) continue;

    // Only process known client codes - skip child detail rows
    // Child rows are things like "Run Rate 25/26", "CPI - 5%", project names, etc.
    if (!clientNames[firstCol]) continue;

    const clientCode = firstCol;
    const clientName = clientNames[clientCode];

    // Skip duplicates (same client+category combination)
    const key = clientCode + '|' + currentCategory;
    if (seen.has(key)) continue;
    seen.add(key);

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
 * - Row 10: Gross License Revenue
 * - Row 12: Gross Professional Services Revenue
 * - Row 18: Gross Maintenance Revenue
 * - Row 27: Gross Hardware
 * - Row 36: Gross Revenue Total
 * Columns: C-E=Q1, F-H=Q2, I-K=Q3, L-N=Q4, U=FY${FISCAL_YEAR} Forecast
 */
async function syncRevenueStreams(workbook) {
  console.log('💰 Extracting revenue streams from APAC BURC...');

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: APAC BURC');
    return;
  }

  // Revenue stream row mappings
  const streamMappings = [
    { row: 10, stream: 'License' },
    { row: 12, stream: 'Professional Services' },
    { row: 18, stream: 'Maintenance' },
    { row: 27, stream: 'Hardware' },
    { row: 36, stream: 'Gross Revenue' },
    { row: 38, stream: 'License COGS' },
  ];

  await supabase.from('burc_revenue_streams').delete().neq('stream', '');

  const records = [];
  for (const mapping of streamMappings) {
    const monthlyValues = readMonthlyRow(sheet, mapping.row);
    const q1 = [0, 1, 2].reduce((s, i) => s + (typeof monthlyValues[i] === 'number' ? monthlyValues[i] : 0), 0);
    const q2 = [3, 4, 5].reduce((s, i) => s + (typeof monthlyValues[i] === 'number' ? monthlyValues[i] : 0), 0);
    const q3 = [6, 7, 8].reduce((s, i) => s + (typeof monthlyValues[i] === 'number' ? monthlyValues[i] : 0), 0);
    const q4 = [9, 10, 11].reduce((s, i) => s + (typeof monthlyValues[i] === 'number' ? monthlyValues[i] : 0), 0);
    const annual = getCellValue(sheet, `U${mapping.row}`) || (q1 + q2 + q3 + q4);

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
    console.log(`   FY${FISCAL_YEAR} Gross Revenue: $${(grossRev.annual_total / 1000000).toFixed(3)}M`);
  }
  console.log(`   ✅ ${records.length} revenue stream entries synced`);
}

// Run
syncBurcData();
