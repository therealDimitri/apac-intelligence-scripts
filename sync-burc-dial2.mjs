#!/usr/bin/env node
/**
 * Sync BURC Dial 2 Risk Profile Summary
 *
 * Extracts opportunity-level data with probability breakdown:
 * - Best Case (Green/Yellow/Red probabilities)
 * - Business Case
 * - Pipeline (NOT in forecast)
 * - Lost
 *
 * This provides granular visibility into the sales pipeline
 * beyond the aggregate totals in Maint Pivot.
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BURC_PATH = BURC_MASTER_FILE;

async function syncDial2() {
  console.log('=== Syncing Dial 2 Risk Profile Summary ===\n');
  console.log('Source:', BURC_PATH, '\n');

  const workbook = XLSX.readFile(BURC_PATH);
  const sheet = workbook.Sheets['Dial 2 Risk Profile Summary'];

  if (!sheet) {
    console.log('ERROR: Sheet "Dial 2 Risk Profile Summary" not found');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Clear existing data
  console.log('Clearing existing burc_dial2_opportunities data...');
  await supabase.from('burc_dial2_opportunities').delete().gte('id', '00000000-0000-0000-0000-000000000000');

  const records = [];
  let currentSection = null;
  let currentProbability = null;
  let inForecast = true;

  // Excel date conversion (Excel dates are days since 1900-01-01)
  const excelToDate = (excelDate) => {
    if (!excelDate || typeof excelDate !== 'number') return null;
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  };

  // Extract client from project name
  const extractClient = (projectName) => {
    const clientPatterns = [
      'SA Health', 'WA Health', 'Western Health', 'Sing Health',
      'AWH', 'BWH', 'EPH', 'GHA', 'GHRA', 'GRMC', 'MAH', 'NCS', 'RVEEH', 'SLMC', 'Waikato',
      'MinDef', 'Mindef'
    ];

    for (const pattern of clientPatterns) {
      if (projectName.includes(pattern)) {
        return pattern;
      }
    }
    return null;
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCol = String(row[0] || '').trim();
    const secondCol = String(row[1] || '').trim();

    // Detect section headers
    if (firstCol === 'Green:') {
      currentSection = 'Best Case';
      currentProbability = 'Green';
      inForecast = true;
      console.log('Section: Green (Best Case - High Probability)');
      continue;
    }
    if (firstCol === 'Yellow:') {
      currentSection = 'Best Case';
      currentProbability = 'Yellow';
      inForecast = true;
      console.log('Section: Yellow (Best Case - Medium Probability)');
      continue;
    }
    if (firstCol === 'Red:') {
      currentSection = 'Best Case';
      currentProbability = 'Red';
      inForecast = true;
      console.log('Section: Red (Best Case - Lower Probability)');
      continue;
    }
    if (firstCol.startsWith('Business Case')) {
      currentSection = 'Business Case';
      currentProbability = null;
      inForecast = true;
      console.log('Section: Business Case');
      continue;
    }
    if (firstCol.startsWith('Pipeline')) {
      currentSection = 'Pipeline';
      currentProbability = null;
      inForecast = false;
      console.log('Section: Pipeline (NOT in forecast)');
      continue;
    }
    if (firstCol.startsWith('Lost') || firstCol.startsWith('Lost or moved')) {
      currentSection = 'Lost';
      currentProbability = null;
      inForecast = true;
      console.log('Section: Lost');
      continue;
    }
    if (firstCol.startsWith('Closed in')) {
      currentSection = 'Closed';
      currentProbability = null;
      inForecast = true;
      console.log('Section: Closed in 2026');
      continue;
    }

    // Skip total rows and empty sections
    if (firstCol.startsWith('Total') || firstCol === '' || firstCol.startsWith('Anything')) continue;
    if (!currentSection) continue;

    // Skip header rows
    if (firstCol.includes('Closure Date') || secondCol.includes('Closure Date')) continue;
    if (firstCol === 'Totals') continue;

    // This should be a data row
    const projectName = firstCol;
    const category = secondCol || currentSection;

    // Skip if no real project name
    if (!projectName || projectName.length < 3) continue;

    // Parse dates and agreement number
    const closureDate = excelToDate(row[2]);
    const oracleAgreement = row[3] ? String(row[3]) : null;
    const swDate = excelToDate(row[4]);
    const psDate = excelToDate(row[5]);
    const maintDate = excelToDate(row[6]);
    const hwDate = excelToDate(row[7]);

    const clientName = extractClient(projectName);

    records.push({
      project_name: projectName,
      category: currentSection,
      probability: currentProbability,
      client_name: clientName,
      oracle_agreement: oracleAgreement,
      closure_date: closureDate,
      sw_date: swDate,
      ps_date: psDate,
      maint_date: maintDate,
      hw_date: hwDate,
      in_forecast: inForecast
    });

    console.log(`  ${projectName.substring(0, 45).padEnd(47)} | ${currentSection.padEnd(13)} | ${(currentProbability || '-').padEnd(6)} | ${inForecast ? 'In F/Cast' : 'NOT in F/Cast'}`);
  }

  console.log('\n=== Inserting ' + records.length + ' records ===\n');

  // Insert records
  let errorCount = 0;
  for (const rec of records) {
    const { error } = await supabase
      .from('burc_dial2_opportunities')
      .upsert(rec, { onConflict: 'project_name,category' });

    if (error) {
      console.log('Error inserting:', rec.project_name, '-', error.message);
      errorCount++;
    }
  }

  // Summary
  console.log('\n=== Summary ===\n');

  const { data: summary } = await supabase
    .from('burc_dial2_opportunities')
    .select('category, probability, in_forecast');

  const stats = {};
  summary?.forEach(r => {
    const key = r.probability ? `${r.category} (${r.probability})` : r.category;
    if (!stats[key]) stats[key] = { count: 0, inForecast: r.in_forecast };
    stats[key].count++;
  });

  for (const [key, val] of Object.entries(stats)) {
    console.log(`${key.padEnd(25)} : ${val.count} opportunities ${val.inForecast ? '(In Forecast)' : '(NOT in Forecast)'}`);
  }

  console.log('\nTotal:', records.length, 'opportunities synced');
  if (errorCount > 0) {
    console.log('Errors:', errorCount);
  }
}

syncDial2().catch(console.error);
