#!/usr/bin/env node
/**
 * Apply Conservative APAC Exclusion
 * Marks additional global responses as APAC duplicates based on score matching
 * for responses without verbatim feedback
 */

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

// APAC responses without feedback (from our analysis)
const APAC_NO_FEEDBACK = [
  { score: 6, client: 'SingHealth' },
  { score: 5, client: 'Ministry of Defence, Singapore' },
  { score: 7, client: 'Ministry of Defence, Singapore' },
  { score: 10, client: 'Ministry of Defence, Singapore' },
  { score: 10, client: 'Gippsland Health Alliance (GHA)' },
  { score: 7, client: 'Western Australia Department Of Health' },
  { score: 7, client: 'Western Australia Department Of Health' },
  { score: 8, client: 'Western Australia Department Of Health' },
  { score: 5, client: 'Mount Alvernia Hospital' },
  { score: 6, client: 'Mount Alvernia Hospital' },
  { score: 7, client: 'Department of Health - Victoria' },
];

async function applyConservativeExclusion() {
  console.log('=== Applying Conservative APAC Exclusion ===\n');

  // Group by score
  const scoreGroups = {};
  APAC_NO_FEEDBACK.forEach(r => {
    scoreGroups[r.score] = (scoreGroups[r.score] || 0) + 1;
  });

  console.log('APAC responses to exclude by score:');
  Object.entries(scoreGroups).forEach(([score, count]) => {
    console.log(`  Score ${score}: ${count} response(s)`);
  });

  let totalUpdated = 0;

  // For each score, find global responses without feedback and mark as APAC duplicate
  for (const [score, count] of Object.entries(scoreGroups)) {
    console.log(`\nProcessing score ${score} (need to mark ${count} as duplicates)...`);

    // Find global responses with this score, no feedback, not already marked as duplicate
    const { data: candidates, error: fetchError } = await supabase
      .from('global_nps_benchmark')
      .select('id, score, feedback, is_apac_duplicate')
      .eq('score', parseInt(score))
      .eq('is_apac_duplicate', false)
      .or('feedback.is.null,feedback.eq.')
      .limit(count);

    if (fetchError) {
      console.error(`Error fetching candidates for score ${score}:`, fetchError);
      continue;
    }

    // If not enough blank candidates, try short feedback (<20 chars)
    let idsToUpdate = candidates?.map(c => c.id) || [];

    if (idsToUpdate.length < count) {
      console.log(`  Only found ${idsToUpdate.length} blank entries, checking short feedback...`);

      const { data: shortCandidates } = await supabase
        .from('global_nps_benchmark')
        .select('id, feedback')
        .eq('score', parseInt(score))
        .eq('is_apac_duplicate', false)
        .not('id', 'in', `(${idsToUpdate.join(',') || 0})`);

      // Filter for short feedback
      const additionalIds = (shortCandidates || [])
        .filter(c => !c.feedback || c.feedback.length < 20)
        .slice(0, count - idsToUpdate.length)
        .map(c => c.id);

      idsToUpdate = [...idsToUpdate, ...additionalIds];
    }

    if (idsToUpdate.length === 0) {
      console.log(`  ⚠️ No suitable candidates found for score ${score}`);
      continue;
    }

    // Update these records
    const { error: updateError, count: updatedCount } = await supabase
      .from('global_nps_benchmark')
      .update({
        is_apac_duplicate: true,
        region: 'APAC (inferred duplicate)',
      })
      .in('id', idsToUpdate);

    if (updateError) {
      console.error(`Error updating score ${score}:`, updateError);
    } else {
      console.log(`  ✅ Marked ${idsToUpdate.length} response(s) as APAC duplicate`);
      totalUpdated += idsToUpdate.length;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total additional responses marked as APAC duplicate: ${totalUpdated}`);

  // Verify final counts
  const { data: finalData } = await supabase
    .from('global_nps_benchmark')
    .select('is_apac_duplicate, region');

  const duplicates = finalData.filter(r => r.is_apac_duplicate);
  const nonDuplicates = finalData.filter(r => !r.is_apac_duplicate);

  console.log(`\n=== Final Benchmark Table ===`);
  console.log(`Total records: ${finalData.length}`);
  console.log(`Marked as APAC duplicate: ${duplicates.length}`);
  console.log(`Marked as Global (non-APAC): ${nonDuplicates.length}`);

  // Recalculate NPS
  const globalScores = nonDuplicates.length; // This is count, need actual scores
  const { data: globalOnlyData } = await supabase
    .from('global_nps_benchmark')
    .select('score')
    .eq('is_apac_duplicate', false);

  const scores = globalOnlyData.map(r => r.score);
  const promoters = scores.filter(s => s >= 9).length;
  const detractors = scores.filter(s => s <= 6).length;
  const nps = ((promoters - detractors) / scores.length * 100).toFixed(1);

  console.log(`\n=== Updated Global NPS (excl. APAC) ===`);
  console.log(`Responses: ${scores.length}`);
  console.log(`NPS: ${nps}`);
  console.log(`Promoters: ${promoters} (${(promoters/scores.length*100).toFixed(1)}%)`);
  console.log(`Detractors: ${detractors} (${(detractors/scores.length*100).toFixed(1)}%)`);
}

applyConservativeExclusion().catch(console.error);
