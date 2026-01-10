#!/usr/bin/env node
/**
 * Import Global NPS Data for Q4 2025
 * - Parses the Excel file
 * - Excludes duplicates already in APAC database
 * - Creates benchmark comparison data
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/NPS/Data/Global/Q4.25 NPS Comments_Global.xlsx';

// Normalise text for comparison
function normaliseText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings (Jaccard similarity)
function calculateSimilarity(text1, text2) {
  const words1 = new Set(normaliseText(text1).split(' ').filter(w => w.length > 3));
  const words2 = new Set(normaliseText(text2).split(' ').filter(w => w.length > 3));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function parseGlobalData() {
  console.log('📖 Reading Global NPS Excel file...');

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['All'];
  const rawData = XLSX.utils.sheet_to_json(sheet);

  const globalResponses = rawData.map((row, index) => ({
    score: row['How likely would you recommend'],
    feedback: row['Comments'] || '',
    category: row['How likely would you recommend'] >= 9 ? 'Promoter' :
              row['How likely would you recommend'] <= 6 ? 'Detractor' : 'Passive',
    row_index: index + 2 // Excel row (1-indexed + header)
  }));

  console.log(`Parsed ${globalResponses.length} global responses`);
  return globalResponses;
}

async function getExistingAPACData() {
  console.log('\n📊 Fetching existing APAC NPS data (Q4 25)...');

  const { data, error } = await supabase
    .from('nps_responses')
    .select('*')
    .eq('period', 'Q4 25');

  if (error) {
    console.error('Error fetching APAC data:', error);
    return [];
  }

  console.log(`Found ${data?.length || 0} APAC responses for Q4 25`);
  return data || [];
}

function findDuplicates(globalData, apacData) {
  console.log('\n🔍 Detecting potential duplicates...');

  const apacFeedback = apacData
    .filter(r => r.feedback && r.feedback.length > 20)
    .map(r => ({
      feedback: r.feedback,
      normalised: normaliseText(r.feedback),
      score: r.score,
      client: r.client_name
    }));

  const duplicates = [];
  const unique = [];

  for (const global of globalData) {
    if (!global.feedback || global.feedback.length < 20) {
      // No meaningful comment to match
      unique.push({ ...global, match_type: 'no_feedback' });
      continue;
    }

    const globalNorm = normaliseText(global.feedback);
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const apac of apacFeedback) {
      // Check exact score match first
      if (apac.score === global.score) {
        const similarity = calculateSimilarity(global.feedback, apac.feedback);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = apac;
        }
      }
    }

    if (bestSimilarity >= 0.8) {
      duplicates.push({
        ...global,
        match_similarity: bestSimilarity,
        matched_client: bestMatch.client,
        matched_feedback: bestMatch.feedback.substring(0, 100)
      });
    } else {
      unique.push({ ...global, match_type: 'unique' });
    }
  }

  console.log(`  Found ${duplicates.length} potential duplicates (≥80% similarity)`);
  console.log(`  Found ${unique.length} unique global responses`);

  return { duplicates, unique };
}

function calculateNPSMetrics(responses) {
  const scores = responses.map(r => r.score).filter(s => s != null);
  if (scores.length === 0) return null;

  const promoters = scores.filter(s => s >= 9).length;
  const passives = scores.filter(s => s >= 7 && s <= 8).length;
  const detractors = scores.filter(s => s <= 6).length;
  const nps = ((promoters - detractors) / scores.length * 100);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    total: scores.length,
    average: avg,
    nps: nps,
    promoters: { count: promoters, pct: (promoters / scores.length * 100) },
    passives: { count: passives, pct: (passives / scores.length * 100) },
    detractors: { count: detractors, pct: (detractors / scores.length * 100) }
  };
}

async function createBenchmarkTable() {
  console.log('\n🗄️ Creating global_nps_benchmark table...');

  // Check if table exists
  const { data: existing } = await supabase
    .from('global_nps_benchmark')
    .select('id')
    .limit(1);

  if (existing !== null) {
    console.log('Table already exists');
    return true;
  }

  // Table doesn't exist - we'll need to create it via migration
  console.log('Table does not exist - creating via SQL...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS global_nps_benchmark (
      id SERIAL PRIMARY KEY,
      score INTEGER NOT NULL,
      category TEXT NOT NULL,
      feedback TEXT,
      period TEXT NOT NULL DEFAULT 'Q4 25',
      region TEXT DEFAULT 'Global (excl. APAC)',
      is_apac_duplicate BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE global_nps_benchmark ENABLE ROW LEVEL SECURITY;

    -- Allow authenticated users to read
    CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON global_nps_benchmark
      FOR SELECT TO authenticated USING (true);

    -- Allow service role full access
    CREATE POLICY IF NOT EXISTS "Allow service role all" ON global_nps_benchmark
      FOR ALL TO service_role USING (true);
  `;

  // Since we can't run DDL directly, we'll insert data and let Supabase auto-create
  return true;
}

async function importGlobalData(uniqueResponses, duplicates) {
  console.log('\n💾 Importing global NPS data to Supabase...');

  // Prepare records
  const records = [
    ...uniqueResponses.map(r => ({
      score: r.score,
      category: r.category,
      feedback: r.feedback || null,
      period: 'Q4 25',
      region: 'Global (excl. APAC)',
      is_apac_duplicate: false
    })),
    ...duplicates.map(r => ({
      score: r.score,
      category: r.category,
      feedback: r.feedback || null,
      period: 'Q4 25',
      region: 'APAC (duplicate)',
      is_apac_duplicate: true
    }))
  ];

  // Delete existing Q4 25 global data first
  const { error: deleteError } = await supabase
    .from('global_nps_benchmark')
    .delete()
    .eq('period', 'Q4 25');

  if (deleteError && !deleteError.message.includes('does not exist')) {
    console.error('Delete error:', deleteError);
  }

  // Insert in batches
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('global_nps_benchmark')
      .insert(batch);

    if (error) {
      console.error(`Batch insert error at ${i}:`, error);
      if (error.message.includes('does not exist')) {
        console.log('\n⚠️ Table does not exist. Please run the migration first.');
        console.log('SQL migration saved to: docs/migrations/20251226_global_nps_benchmark.sql');
        return false;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`✅ Inserted ${inserted} records`);
  return true;
}

async function main() {
  console.log('🌏 Global NPS Import Script - Q4 2025\n');
  console.log('='.repeat(60));

  // Step 1: Parse Global Excel
  const globalData = parseGlobalData();

  // Step 2: Get existing APAC data
  const apacData = await getExistingAPACData();

  // Step 3: Calculate and display metrics
  console.log('\n📊 COMPARISON ANALYSIS');
  console.log('='.repeat(60));

  const globalMetrics = calculateNPSMetrics(globalData);
  const apacMetrics = calculateNPSMetrics(apacData);

  console.log('\n📈 GLOBAL Altera Q4 25 NPS:');
  console.log(`  Total responses: ${globalMetrics.total}`);
  console.log(`  Average score: ${globalMetrics.average.toFixed(2)}`);
  console.log(`  NPS Score: ${globalMetrics.nps.toFixed(1)}`);
  console.log(`  Promoters (9-10): ${globalMetrics.promoters.count} (${globalMetrics.promoters.pct.toFixed(1)}%)`);
  console.log(`  Passives (7-8): ${globalMetrics.passives.count} (${globalMetrics.passives.pct.toFixed(1)}%)`);
  console.log(`  Detractors (0-6): ${globalMetrics.detractors.count} (${globalMetrics.detractors.pct.toFixed(1)}%)`);

  if (apacMetrics) {
    console.log('\n📈 APAC Q4 25 NPS:');
    console.log(`  Total responses: ${apacMetrics.total}`);
    console.log(`  Average score: ${apacMetrics.average.toFixed(2)}`);
    console.log(`  NPS Score: ${apacMetrics.nps.toFixed(1)}`);
    console.log(`  Promoters (9-10): ${apacMetrics.promoters.count} (${apacMetrics.promoters.pct.toFixed(1)}%)`);
    console.log(`  Passives (7-8): ${apacMetrics.passives.count} (${apacMetrics.passives.pct.toFixed(1)}%)`);
    console.log(`  Detractors (0-6): ${apacMetrics.detractors.count} (${apacMetrics.detractors.pct.toFixed(1)}%)`);

    console.log('\n📊 COMPARISON:');
    console.log(`  NPS Difference: ${(apacMetrics.nps - globalMetrics.nps).toFixed(1)} points (APAC ${apacMetrics.nps > globalMetrics.nps ? 'higher' : 'lower'})`);
    console.log(`  Avg Score Difference: ${(apacMetrics.average - globalMetrics.average).toFixed(2)} (APAC ${apacMetrics.average > globalMetrics.average ? 'higher' : 'lower'})`);
  }

  // Step 4: Find duplicates
  const { duplicates, unique } = findDuplicates(globalData, apacData);

  if (duplicates.length > 0) {
    console.log('\n📋 Sample duplicate matches:');
    duplicates.slice(0, 3).forEach((d, i) => {
      console.log(`\n  ${i + 1}. Global score ${d.score} (${(d.match_similarity * 100).toFixed(0)}% match)`);
      console.log(`     Client: ${d.matched_client}`);
      console.log(`     Global: "${d.feedback.substring(0, 60)}..."`);
      console.log(`     APAC: "${d.matched_feedback}..."`);
    });
  }

  // Step 5: Verbatim analysis
  console.log('\n📝 VERBATIM ANALYSIS');
  console.log('='.repeat(60));

  const globalWithFeedback = globalData.filter(r => r.feedback && r.feedback.length > 20);
  const apacWithFeedback = apacData.filter(r => r.feedback && r.feedback.length > 20);

  console.log(`\nGlobal responses with meaningful feedback: ${globalWithFeedback.length} (${(globalWithFeedback.length / globalData.length * 100).toFixed(1)}%)`);
  console.log(`APAC responses with meaningful feedback: ${apacWithFeedback.length} (${(apacWithFeedback.length / apacData.length * 100).toFixed(1)}%)`);

  // Common themes/keywords in detractors
  const globalDetractorFeedback = globalData.filter(r => r.score <= 6 && r.feedback).map(r => r.feedback.toLowerCase());
  const apacDetractorFeedback = apacData.filter(r => r.score <= 6 && r.feedback).map(r => r.feedback.toLowerCase());

  const keywords = ['support', 'communication', 'response', 'time', 'issue', 'problem', 'upgrade', 'service', 'staff', 'training'];

  console.log('\n🔍 Detractor Keyword Frequency:');
  console.log('Keyword\t\t\tGlobal\tAPAC');
  console.log('-'.repeat(40));

  for (const keyword of keywords) {
    const globalCount = globalDetractorFeedback.filter(f => f.includes(keyword)).length;
    const apacCount = apacDetractorFeedback.filter(f => f.includes(keyword)).length;
    const globalPct = globalDetractorFeedback.length > 0 ? (globalCount / globalDetractorFeedback.length * 100).toFixed(0) : 0;
    const apacPct = apacDetractorFeedback.length > 0 ? (apacCount / apacDetractorFeedback.length * 100).toFixed(0) : 0;
    console.log(`${keyword.padEnd(16)}\t${globalCount} (${globalPct}%)\t${apacCount} (${apacPct}%)`);
  }

  // Save analysis results
  const analysisResults = {
    period: 'Q4 25',
    generated_at: new Date().toISOString(),
    global: {
      total_responses: globalMetrics.total,
      nps_score: globalMetrics.nps,
      average_score: globalMetrics.average,
      promoters: globalMetrics.promoters,
      passives: globalMetrics.passives,
      detractors: globalMetrics.detractors,
      responses_with_feedback: globalWithFeedback.length
    },
    apac: apacMetrics ? {
      total_responses: apacMetrics.total,
      nps_score: apacMetrics.nps,
      average_score: apacMetrics.average,
      promoters: apacMetrics.promoters,
      passives: apacMetrics.passives,
      detractors: apacMetrics.detractors,
      responses_with_feedback: apacWithFeedback.length
    } : null,
    comparison: apacMetrics ? {
      nps_difference: apacMetrics.nps - globalMetrics.nps,
      apac_vs_global: apacMetrics.nps > globalMetrics.nps ? 'APAC Higher' : 'Global Higher',
      avg_score_difference: apacMetrics.average - globalMetrics.average
    } : null,
    duplicates_detected: duplicates.length,
    unique_global_responses: unique.length
  };

  console.log('\n📁 Analysis Summary (JSON):');
  console.log(JSON.stringify(analysisResults, null, 2));

  // Ask about import
  console.log('\n' + '='.repeat(60));
  console.log('To import this data to Supabase, run with --import flag');
  console.log('='.repeat(60));

  if (process.argv.includes('--import')) {
    await importGlobalData(unique, duplicates);
  }
}

main().catch(console.error);
