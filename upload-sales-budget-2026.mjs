import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/Documents/Client Success/Team Docs/Sales Targets/2026/APAC 2026 Sales Budget 6Jan2026.xlsx';

async function createTables() {
  console.log('Creating tables...');

  // Create cse_sales_targets table
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS cse_sales_targets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiscal_year INT NOT NULL,
        cse_name TEXT NOT NULL,
        territory TEXT,
        total_acv DECIMAL(15,2) DEFAULT 0,
        weighted_acv DECIMAL(15,2) DEFAULT 0,
        acv_net_cogs DECIMAL(15,2) DEFAULT 0,
        tcv DECIMAL(15,2) DEFAULT 0,
        q1_target DECIMAL(15,2) DEFAULT 0,
        q2_target DECIMAL(15,2) DEFAULT 0,
        q3_target DECIMAL(15,2) DEFAULT 0,
        q4_target DECIMAL(15,2) DEFAULT 0,
        source_file TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(fiscal_year, cse_name)
      );

      CREATE TABLE IF NOT EXISTS pipeline_deals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiscal_year INT NOT NULL,
        fiscal_quarter TEXT,
        forecast_category TEXT,
        account_name TEXT NOT NULL,
        opportunity_name TEXT NOT NULL,
        cse_name TEXT,
        cam_name TEXT,
        in_out TEXT,
        is_under_75k BOOLEAN DEFAULT FALSE,
        is_upside BOOLEAN DEFAULT FALSE,
        is_focus_deal BOOLEAN DEFAULT FALSE,
        close_date DATE,
        oracle_quote_number TEXT,
        total_acv DECIMAL(15,2) DEFAULT 0,
        weighted_acv DECIMAL(15,2) DEFAULT 0,
        acv_net_cogs DECIMAL(15,2) DEFAULT 0,
        tcv DECIMAL(15,2) DEFAULT 0,
        source_file TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Add RLS policies
      ALTER TABLE cse_sales_targets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE pipeline_deals ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow all for cse_sales_targets" ON cse_sales_targets;
      CREATE POLICY "Allow all for cse_sales_targets" ON cse_sales_targets FOR ALL USING (true);

      DROP POLICY IF EXISTS "Allow all for pipeline_deals" ON pipeline_deals;
      CREATE POLICY "Allow all for pipeline_deals" ON pipeline_deals FOR ALL USING (true);
    `
  });

  if (e1) {
    console.log('RPC not available, using direct insert approach...');
  }
}

async function parseAndUpload() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);

  // ===============================
  // Parse CSE Sales Budget
  // ===============================
  const cseSheet = workbook.Sheets['Sales Budget CSE'];
  const cseData = XLSX.utils.sheet_to_json(cseSheet, { header: 1, defval: '' });

  const cseTargets = [];
  const cseDeals = [];
  let currentCSE = null;

  // CSE to territory mapping
  const cseToTerritory = {
    'Johnathan Salisbury': 'WA, Western Health, Barwon',
    'Laura Messing': 'SA Health',
    'Nikki Wei': 'Asia + Guam',
    'Tracey Bland': 'Victoria, NZ',
    'Kenny Gan': 'Singapore'
  };

  cseData.forEach((row, i) => {
    if (i === 0) return;

    const name = String(row[0] || '').trim();
    const totalACV = parseFloat(row[1]) || 0;
    const weightedACV = parseFloat(row[2]) || 0;
    const acvNetCOGS = parseFloat(row[3]) || 0;
    const tcv = parseFloat(row[4]) || 0;

    if (!name) return;

    // Check if this is a CSE summary row
    const knownCSEs = Object.keys(cseToTerritory);
    if (knownCSEs.includes(name)) {
      currentCSE = name;
      cseTargets.push({
        fiscal_year: 2026,
        cse_name: name,
        territory: cseToTerritory[name],
        total_acv: totalACV,
        weighted_acv: weightedACV,
        acv_net_cogs: acvNetCOGS,
        tcv: tcv,
        // Distribute evenly across quarters as default
        q1_target: Math.round(totalACV / 4 * 100) / 100,
        q2_target: Math.round(totalACV / 4 * 100) / 100,
        q3_target: Math.round(totalACV / 4 * 100) / 100,
        q4_target: Math.round(totalACV / 4 * 100) / 100,
        source_file: 'APAC 2026 Sales Budget 6Jan2026.xlsx'
      });
    } else if (currentCSE && totalACV > 0) {
      // This is a deal under the current CSE
      cseDeals.push({
        fiscal_year: 2026,
        account_name: name.split(' - ')[0] || name,
        opportunity_name: name,
        cse_name: currentCSE,
        total_acv: totalACV,
        weighted_acv: weightedACV,
        acv_net_cogs: acvNetCOGS,
        tcv: tcv,
        source_file: 'APAC 2026 Sales Budget 6Jan2026.xlsx'
      });
    }
  });

  console.log(`Parsed ${cseTargets.length} CSE targets`);
  console.log(`Parsed ${cseDeals.length} CSE deals`);

  // ===============================
  // Parse Pipeline by Quarter
  // ===============================
  const pipelineSheet = workbook.Sheets['APAC Pipeline by Qtr'];
  const pipelineData = XLSX.utils.sheet_to_json(pipelineSheet, { header: 1, defval: '' });

  const pipelineDeals = [];

  pipelineData.forEach((row, i) => {
    if (i < 6) return; // Skip headers

    const quarter = String(row[0] || '').trim();
    const forecastCategory = String(row[1] || '').trim();
    const account = String(row[2] || '').trim();
    const opportunity = String(row[3] || '').trim();
    const cse = String(row[4] || '').trim();
    const cam = String(row[5] || '').trim();
    const inOut = String(row[6] || '').trim();
    const under75k = String(row[7] || '').toLowerCase();
    const upside = row[8];
    const focusDeal = row[9];
    const closeDate = row[10];
    const oracleQuote = row[11];

    if (!quarter || !account || !opportunity) return;

    // Parse close date
    let parsedDate = null;
    if (closeDate) {
      const dateStr = String(closeDate);
      // Handle M/D/YYYY format
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        parsedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }

    pipelineDeals.push({
      fiscal_year: 2026,
      fiscal_quarter: quarter,
      forecast_category: forecastCategory,
      account_name: account,
      opportunity_name: opportunity,
      cse_name: cse || null,
      cam_name: cam || null,
      in_out: inOut,
      is_under_75k: under75k === 'yes',
      is_upside: upside === true,
      is_focus_deal: focusDeal === true,
      close_date: parsedDate,
      oracle_quote_number: oracleQuote ? String(oracleQuote) : null,
      source_file: 'APAC 2026 Sales Budget 6Jan2026.xlsx'
    });
  });

  console.log(`Parsed ${pipelineDeals.length} pipeline deals`);

  // ===============================
  // Upload to Supabase
  // ===============================

  // Clear existing data for FY2026
  console.log('Clearing existing FY2026 data...');
  await supabase.from('cse_sales_targets').delete().eq('fiscal_year', 2026);
  await supabase.from('pipeline_deals').delete().eq('fiscal_year', 2026);

  // Upload CSE targets
  console.log('Uploading CSE sales targets...');
  const { data: targetData, error: targetError } = await supabase
    .from('cse_sales_targets')
    .upsert(cseTargets, { onConflict: 'fiscal_year,cse_name' })
    .select();

  if (targetError) {
    console.error('Error uploading CSE targets:', targetError);
  } else {
    console.log(`✅ Uploaded ${targetData?.length || 0} CSE targets`);
  }

  // Upload pipeline deals in batches
  console.log('Uploading pipeline deals...');
  const batchSize = 50;
  let uploadedDeals = 0;

  for (let i = 0; i < pipelineDeals.length; i += batchSize) {
    const batch = pipelineDeals.slice(i, i + batchSize);
    const { error: dealError } = await supabase.from('pipeline_deals').insert(batch);

    if (dealError) {
      console.error(`Error uploading batch ${i}:`, dealError);
    } else {
      uploadedDeals += batch.length;
    }
  }

  console.log(`✅ Uploaded ${uploadedDeals} pipeline deals`);

  // Print summary
  console.log('\n=== SUMMARY ===');
  cseTargets.forEach(t => {
    console.log(`${t.cse_name} (${t.territory}): $${t.total_acv.toLocaleString()} total ACV`);
  });

  console.log(`\nPipeline deals by quarter:`);
  const byQtr = {};
  pipelineDeals.forEach(d => {
    byQtr[d.fiscal_quarter] = (byQtr[d.fiscal_quarter] || 0) + 1;
  });
  Object.entries(byQtr).sort().forEach(([q, count]) => {
    console.log(`  ${q}: ${count} deals`);
  });
}

// Run
parseAndUpload().catch(console.error);
