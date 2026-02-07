#!/usr/bin/env node
/**
 * Sync BURC Data - Comprehensive extraction from 2026 APAC Performance.xlsx
 *
 * Extracts:
 * - Monthly EBITA targets and actuals
 * - Quarterly revenue comparison (2026 vs 2025)
 * - Waterfall data (path to target)
 * - Client-level maintenance revenue
 * - Detailed PS pipeline by project
 * - Revenue breakdown by stream
 *
 * Run this script whenever the BURC file is updated to sync latest data.
 */

import pg from 'pg';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const { Client } = pg;

const BURC_PATH = BURC_MASTER_FILE;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function syncBurcData() {
  // Use pooler connection (port 6543) as direct connection (port 5432) is often blocked
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  console.log('📊 Syncing BURC data from Excel file...');
  console.log(`   File: ${BURC_PATH}\n`);

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read BURC file
    const workbook = XLSX.readFile(BURC_PATH);

    // Create tables if not exist
    await createTables(client);

    // Extract and sync all data
    await syncEbitaData(client, workbook);
    await syncQuarterlyComparison(client, workbook);
    await syncWaterfallData(client, workbook);
    await syncClientMaintenance(client, workbook);
    await syncPsPipeline(client, workbook);
    await syncRevenueStreams(client, workbook);

    // Update last sync timestamp
    await client.query(`
      INSERT INTO burc_sync_log (synced_at, file_path, status)
      VALUES (NOW(), $1, 'success')
    `, [BURC_PATH]);

    console.log('\n✅ BURC data synced successfully!');
    console.log(`   Last sync: ${new Date().toISOString()}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

async function createTables(client) {
  console.log('📋 Creating/updating tables...');

  // EBITA monthly tracking
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_ebita_monthly (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INTEGER NOT NULL,
      month TEXT NOT NULL,
      month_num INTEGER NOT NULL,
      target_ebita DECIMAL(15,2),
      actual_ebita DECIMAL(15,2),
      variance DECIMAL(15,2),
      ebita_percent DECIMAL(8,4),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month_num)
    );
  `);

  // Quarterly comparison
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_quarterly (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INTEGER NOT NULL,
      quarter TEXT NOT NULL,
      revenue_stream TEXT NOT NULL,
      amount DECIMAL(15,2),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, quarter, revenue_stream)
    );
  `);

  // Waterfall data
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_waterfall (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL UNIQUE,
      amount DECIMAL(15,2),
      description TEXT,
      sort_order INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Client maintenance revenue
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_client_maintenance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_code TEXT NOT NULL,
      client_name TEXT,
      category TEXT NOT NULL,
      jan DECIMAL(15,2), feb DECIMAL(15,2), mar DECIMAL(15,2),
      apr DECIMAL(15,2), may DECIMAL(15,2), jun DECIMAL(15,2),
      jul DECIMAL(15,2), aug DECIMAL(15,2), sep DECIMAL(15,2),
      oct DECIMAL(15,2), nov DECIMAL(15,2), dec DECIMAL(15,2),
      annual_total DECIMAL(15,2),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_code, category)
    );
  `);

  // PS Pipeline by project
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_ps_pipeline (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      project_name TEXT NOT NULL,
      category TEXT NOT NULL,
      jan DECIMAL(15,2), feb DECIMAL(15,2), mar DECIMAL(15,2),
      apr DECIMAL(15,2), may DECIMAL(15,2), jun DECIMAL(15,2),
      jul DECIMAL(15,2), aug DECIMAL(15,2), sep DECIMAL(15,2),
      oct DECIMAL(15,2), nov DECIMAL(15,2), dec DECIMAL(15,2),
      annual_total DECIMAL(15,2),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_name, project_name, category)
    );
  `);

  // Revenue by stream summary
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_revenue_streams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stream TEXT NOT NULL,
      category TEXT NOT NULL,
      q1 DECIMAL(15,2), q2 DECIMAL(15,2), q3 DECIMAL(15,2), q4 DECIMAL(15,2),
      annual_total DECIMAL(15,2),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(stream, category)
    );
  `);

  // Sync log
  await client.query(`
    CREATE TABLE IF NOT EXISTS burc_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      file_path TEXT,
      status TEXT,
      error_message TEXT
    );
  `);

  console.log('   ✅ Tables ready\n');
}

async function syncEbitaData(client, workbook) {
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

  // Clear existing data for this year
  await client.query('DELETE FROM burc_ebita_monthly WHERE year = 2026');

  let insertCount = 0;
  for (let i = 0; i < 12; i++) {
    const month = MONTHS[i];
    const colIndex = i + 1; // Column B onwards

    const target = data[baselineRow]?.[colIndex] || null;
    const actual = data[actualRow]?.[colIndex] || null;
    const ebitaPct = data[ebitaPercentRow]?.[colIndex] || null;

    if (actual !== null || target !== null) {
      const variance = (actual && target) ? actual - target : actual;

      await client.query(`
        INSERT INTO burc_ebita_monthly (year, month, month_num, target_ebita, actual_ebita, variance, ebita_percent)
        VALUES (2026, $1, $2, $3, $4, $5, $6)
        ON CONFLICT (year, month_num) DO UPDATE SET
          target_ebita = EXCLUDED.target_ebita,
          actual_ebita = EXCLUDED.actual_ebita,
          variance = EXCLUDED.variance,
          ebita_percent = EXCLUDED.ebita_percent,
          updated_at = NOW()
      `, [month, i + 1, target, actual, variance, ebitaPct]);
      insertCount++;
    }
  }

  console.log(`   ✅ ${insertCount} months of EBITA data synced`);
}

async function syncQuarterlyComparison(client, workbook) {
  console.log('📊 Extracting quarterly comparison...');

  const sheet = workbook.Sheets['26 vs 25 Q Comparison'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: 26 vs 25 Q Comparison');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Revenue streams to extract
  const streams = {
    'License Revenue': 'license',
    'Professional Services Revenue': 'professional_services',
    'Total Maintenance Revenue': 'maintenance',
    'Hardware Revenue': 'hardware',
    'Business Case Revenue': 'business_case',
    'Gross Revenue': 'gross_revenue'
  };

  // Clear existing 2026 data
  await client.query('DELETE FROM burc_quarterly WHERE year = 2026');

  let insertCount = 0;
  for (const row of data) {
    const label = row[0];
    if (streams[label]) {
      const streamKey = streams[label];
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

      for (let q = 0; q < 4; q++) {
        const amount = row[3 + q]; // Q1 starts at column index 3
        if (amount !== undefined && amount !== null) {
          await client.query(`
            INSERT INTO burc_quarterly (year, quarter, revenue_stream, amount)
            VALUES (2026, $1, $2, $3)
            ON CONFLICT (year, quarter, revenue_stream) DO UPDATE SET
              amount = EXCLUDED.amount,
              updated_at = NOW()
          `, [quarters[q], streamKey, amount]);
          insertCount++;
        }
      }
    }
  }

  console.log(`   ✅ ${insertCount} quarterly entries synced`);
}

async function syncWaterfallData(client, workbook) {
  console.log('💧 Extracting waterfall data...');

  const sheet = workbook.Sheets['Waterfall Data'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: Waterfall Data');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Clear existing waterfall data
  await client.query('DELETE FROM burc_waterfall');

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

  let insertCount = 0;
  for (let i = 0; i < waterfallItems.length; i++) {
    const item = waterfallItems[i];
    const amount = data[item.row]?.[1];

    if (amount !== undefined) {
      await client.query(`
        INSERT INTO burc_waterfall (category, amount, description, sort_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (category) DO UPDATE SET
          amount = EXCLUDED.amount,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `, [item.category, amount, item.desc, i + 1]);
      insertCount++;
    }
  }

  console.log(`   ✅ ${insertCount} waterfall items synced`);
}

async function syncClientMaintenance(client, workbook) {
  console.log('🏢 Extracting client maintenance revenue...');

  const sheet = workbook.Sheets['Maint Pivot'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: Maint Pivot');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Clear existing data
  await client.query('DELETE FROM burc_client_maintenance');

  let currentCategory = null;
  let inDataSection = false;
  let insertCount = 0;

  // Client code to full name mapping (all known clients in pivot table)
  const CLIENT_NAMES = {
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
    'Sing Health': 'Sing Health',
    'Waikato': 'Waikato',
    'Western Health': 'Western Health',
    'GRMC': 'GRMC',
    'Parkway': 'Parkway (Churned)'
  };

  // Category headers in the data section
  const CATEGORY_HEADERS = ['Best Case', 'Pipeline', 'Backlog', 'Bus Case', 'Business Case', 'Lost'];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCol = row[0];

    if (!firstCol) continue;
    const trimmed = String(firstCol).trim();

    // Skip until we hit "Row Labels" which marks the start of the data section
    // (Rows before this are summary totals that we skip)
    if (trimmed === 'Row Labels') {
      inDataSection = true;
      continue;
    }

    // Only process rows in the data section
    if (!inDataSection) continue;

    // Check if this is a category header
    if (CATEGORY_HEADERS.includes(trimmed)) {
      currentCategory = trimmed === 'Bus Case' ? 'Business Case' : trimmed;
      continue;
    }

    // Skip if no category set yet
    if (!currentCategory) continue;

    // Only process known client codes (parent rows, not detail sub-items)
    if (CLIENT_NAMES[trimmed]) {
      // Calculate annual from columns B-M (indices 1-12)
      const monthlyValues = [];
      let annualTotal = 0;
      for (let c = 1; c <= 12; c++) {
        const val = Number(row[c]) || 0;
        monthlyValues.push(val);
        annualTotal += val;
      }

      // Allow negative totals (e.g., "Lost" category has negative revenue)
      if (annualTotal !== 0) {
        await client.query(`
          INSERT INTO burc_client_maintenance
          (client_code, client_name, category, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, annual_total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (client_code, category) DO UPDATE SET
            client_name = EXCLUDED.client_name,
            jan = EXCLUDED.jan, feb = EXCLUDED.feb, mar = EXCLUDED.mar,
            apr = EXCLUDED.apr, may = EXCLUDED.may, jun = EXCLUDED.jun,
            jul = EXCLUDED.jul, aug = EXCLUDED.aug, sep = EXCLUDED.sep,
            oct = EXCLUDED.oct, nov = EXCLUDED.nov, dec = EXCLUDED.dec,
            annual_total = EXCLUDED.annual_total,
            updated_at = NOW()
        `, [trimmed, CLIENT_NAMES[trimmed], currentCategory, ...monthlyValues, annualTotal]);
        insertCount++;
      }
    }
    // Skip detail rows (sub-items under each client) - they're not in CLIENT_NAMES
  }

  console.log(`   ✅ ${insertCount} client maintenance entries synced`);
}

async function syncPsPipeline(client, workbook) {
  console.log('📋 Extracting PS pipeline...');

  const sheet = workbook.Sheets['PS Pivot'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: PS Pivot');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Clear existing data
  await client.query('DELETE FROM burc_ps_pipeline');

  let currentCategory = null;
  let currentClient = null;
  let insertCount = 0;

  for (const row of data) {
    const firstCol = row[0];

    // Skip empty rows
    if (!firstCol) continue;

    // Check if this is a category header
    if (['Backlog', 'Best Case', 'Best Cast', 'Pipeline', 'Business Case', 'Reversal'].includes(firstCol)) {
      currentCategory = firstCol === 'Best Cast' ? 'Best Case' : firstCol;
      currentClient = null;
      continue;
    }

    // Skip the "Row Labels" header
    if (firstCol === 'Row Labels') continue;

    // Check if this is a client header (no dashes/spaces typically means client)
    // Projects usually have more specific names
    const isProject = firstCol.includes(' ') && !['SA Health', 'WA Health', 'Western Health'].some(c => firstCol.startsWith(c) && firstCol !== c);

    if (!isProject && currentCategory) {
      currentClient = firstCol;
      continue;
    }

    // This is a project row
    if (currentClient && currentCategory) {
      const projectName = firstCol;

      // Extract monthly values
      const monthlyValues = [];
      let annualTotal = 0;
      for (let i = 1; i <= 12; i++) {
        const val = row[i] || 0;
        monthlyValues.push(val);
        annualTotal += val;
      }

      if (annualTotal > 0) {
        await client.query(`
          INSERT INTO burc_ps_pipeline
          (client_name, project_name, category, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, annual_total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (client_name, project_name, category) DO UPDATE SET
            jan = EXCLUDED.jan, feb = EXCLUDED.feb, mar = EXCLUDED.mar,
            apr = EXCLUDED.apr, may = EXCLUDED.may, jun = EXCLUDED.jun,
            jul = EXCLUDED.jul, aug = EXCLUDED.aug, sep = EXCLUDED.sep,
            oct = EXCLUDED.oct, nov = EXCLUDED.nov, dec = EXCLUDED.dec,
            annual_total = EXCLUDED.annual_total,
            updated_at = NOW()
        `, [currentClient, projectName, currentCategory, ...monthlyValues, annualTotal]);
        insertCount++;
      }
    }
  }

  console.log(`   ✅ ${insertCount} PS pipeline entries synced`);
}

async function syncRevenueStreams(client, workbook) {
  console.log('💰 Extracting revenue streams summary...');

  const sheet = workbook.Sheets['26 vs 25 Q Comparison'];
  if (!sheet) {
    console.log('   ⚠️ Sheet not found: 26 vs 25 Q Comparison');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Clear existing data
  await client.query('DELETE FROM burc_revenue_streams');

  const streamMappings = [
    { label: 'License Revenue', stream: 'License' },
    { label: 'Professional Services Revenue', stream: 'Professional Services' },
    { label: 'Total Maintenance Revenue', stream: 'Maintenance' },
    { label: 'Hardware Revenue', stream: 'Hardware' },
    { label: 'Business Case Revenue', stream: 'Business Case' },
    { label: 'Gross Revenue', stream: 'Gross Revenue' },
    { label: 'License COGS', stream: 'License COGS' },
  ];

  let insertCount = 0;
  for (const row of data) {
    const label = row[0];
    const mapping = streamMappings.find(m => m.label === label);

    if (mapping) {
      const q1 = row[3] || 0;
      const q2 = row[4] || 0;
      const q3 = row[5] || 0;
      const q4 = row[6] || 0;
      const annual = q1 + q2 + q3 + q4;

      await client.query(`
        INSERT INTO burc_revenue_streams (stream, category, q1, q2, q3, q4, annual_total)
        VALUES ($1, 'forecast', $2, $3, $4, $5, $6)
        ON CONFLICT (stream, category) DO UPDATE SET
          q1 = EXCLUDED.q1, q2 = EXCLUDED.q2, q3 = EXCLUDED.q3, q4 = EXCLUDED.q4,
          annual_total = EXCLUDED.annual_total,
          updated_at = NOW()
      `, [mapping.stream, q1, q2, q3, q4, annual]);
      insertCount++;
    }
  }

  console.log(`   ✅ ${insertCount} revenue stream entries synced`);
}

// Run the sync
syncBurcData();
