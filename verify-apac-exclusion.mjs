#!/usr/bin/env node
/**
 * Verify APAC exclusion from Global NPS data
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/NPS/Data/Global/Q4.25 NPS Comments_Global.xlsx';

async function verify() {
  console.log('=== APAC Exclusion Verification ===\n');

  // Get APAC data
  const { data: apacData } = await supabase
    .from('nps_responses')
    .select('score, feedback, client_name')
    .eq('period', 'Q4 25');

  // Parse global Excel
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['All'];
  const globalData = XLSX.utils.sheet_to_json(sheet);

  // Analyse global data - comments
  const globalWithComments = globalData.filter(r => r['Comments'] && String(r['Comments']).trim().length > 0);
  const globalWithoutComments = globalData.filter(r => !r['Comments'] || String(r['Comments']).trim().length === 0);

  console.log('Global Data:');
  console.log('  Total responses:', globalData.length);
  console.log('  With comments:', globalWithComments.length);
  console.log('  Without comments:', globalWithoutComments.length);

  // APAC breakdown
  const apacWithFeedback = apacData.filter(r => r.feedback && r.feedback.length > 20);
  const apacWithoutFeedback = apacData.filter(r => !r.feedback || r.feedback.length <= 20);

  console.log('\nAPAC Data:');
  console.log('  Total responses:', apacData.length);
  console.log('  With feedback:', apacWithFeedback.length);
  console.log('  Without feedback:', apacWithoutFeedback.length);

  // Check if global has blank entries
  if (globalWithoutComments.length > 0) {
    console.log('\n⚠️ Global data has', globalWithoutComments.length, 'responses without comments');
    console.log('These could include APAC responses that cannot be identified by verbatim matching.');

    // Score distribution of no-comment global entries
    const noCommentScores = {};
    globalWithoutComments.forEach(r => {
      const score = r['How likely would you recommend'];
      noCommentScores[score] = (noCommentScores[score] || 0) + 1;
    });
    console.log('\nGlobal no-comment score distribution:', noCommentScores);

    // APAC no-feedback score distribution
    const apacNoFeedbackScores = {};
    apacWithoutFeedback.forEach(r => {
      apacNoFeedbackScores[r.score] = (apacNoFeedbackScores[r.score] || 0) + 1;
    });
    console.log('APAC no-feedback score distribution:', apacNoFeedbackScores);
  } else {
    console.log('\n✅ All global responses have comments - APAC matching by verbatim is valid');
  }

  // Current exclusion stats
  const { data: benchmarkData } = await supabase
    .from('global_nps_benchmark')
    .select('is_apac_duplicate, region');

  const duplicates = benchmarkData.filter(r => r.is_apac_duplicate);
  const nonDuplicates = benchmarkData.filter(r => !r.is_apac_duplicate);

  console.log('\n=== Current Benchmark Table ===');
  console.log('Total records:', benchmarkData.length);
  console.log('Marked as APAC duplicate:', duplicates.length);
  console.log('Marked as Global (non-APAC):', nonDuplicates.length);

  // The key question: Are there APAC responses that weren't matched?
  const unmatchedAPAC = apacData.length - duplicates.length;
  console.log('\n=== Gap Analysis ===');
  console.log('APAC responses:', apacData.length);
  console.log('Matched as duplicates:', duplicates.length);
  console.log('Potentially unmatched:', unmatchedAPAC);

  if (unmatchedAPAC > 0 && globalWithoutComments.length === 0) {
    console.log('\n⚠️ There may be', unmatchedAPAC, 'APAC responses not excluded from global data');
    console.log('However, if global file has no blank entries, these might not be in the file at all.');
  }
}

verify().catch(console.error);
