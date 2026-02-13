#!/usr/bin/env node
/**
 * Import APAC Compass 2026 Survey Data
 * - Reads feedback survey from Excel (41 columns, 10 respondents)
 * - Parses session ratings, day pacing, outcomes, venue ratings
 * - Computes NPS and mean recommend score
 * - Inserts compass_surveys + compass_responses + compass_access rows
 * - Idempotent: deletes existing 2026 data before re-inserting
 *
 * Run:
 *   export $(cat .env.local | grep -v '^#' | xargs) && node scripts/import-compass-survey.mjs
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase setup
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// Excel path & constants
// ---------------------------------------------------------------------------
const EXCEL_PATH =
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Compass 2026 Feedback Survey.xlsx';

const SURVEY_YEAR = 2026;
const SURVEY_TITLE = 'APAC Compass 2026';
const SURVEY_LOCATION = 'Adelaide';
const SURVEY_DATE_START = '2026-01-29';
const SURVEY_DATE_END = '2026-01-31';

// ---------------------------------------------------------------------------
// Column prefixes for JSONB grouping
// ---------------------------------------------------------------------------
const SESSION_PREFIX = 'Rate your experience at APAC Compass:.';
const VENUE_PREFIX = 'Venue/s:.';
const OUTCOME_PREFIX = 'Strategic Outcomes:.';
const DAY_PACING_PREFIX = 'The amount of information on Day ';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the short label from a prefixed column header.
 * e.g. "Rate your experience at APAC Compass:.Welcome & Scene Setting - Dimitri Leimonitis"
 *      → "Welcome & Scene Setting - Dimitri Leimonitis"
 */
function stripPrefix(header, prefix) {
  return header.slice(prefix.length).trim();
}

/**
 * Parse a semicolon-delimited string into a TEXT[] array.
 * Trims each item and filters empty strings.
 */
function parseSemicolonArray(value) {
  if (!value || typeof value !== 'string') return null;
  const items = value
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : null;
}

/**
 * Compute NPS from an array of recommend scores (0-10).
 * Returns integer: (promoters - detractors) / total × 100, rounded.
 */
function computeNPS(scores) {
  const valid = scores.filter((s) => s != null && !isNaN(s));
  if (valid.length === 0) return null;
  const promoters = valid.filter((s) => s >= 9).length;
  const detractors = valid.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / valid.length) * 100);
}

/**
 * Compute the mean of an array of numbers, rounded to 1 decimal place.
 */
function computeMean(scores) {
  const valid = scores.filter((s) => s != null && !isNaN(s));
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Parse Excel
// ---------------------------------------------------------------------------
function parseExcel() {
  console.log('Reading Excel file...');
  console.log(`  Path: ${EXCEL_PATH}\n`);

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['Sheet1'];
  const rawRows = XLSX.utils.sheet_to_json(sheet);

  console.log(`  Found ${rawRows.length} data rows`);

  // Discover column headers from the first row's keys
  const headers = Object.keys(rawRows[0] || {});
  console.log(`  Found ${headers.length} columns\n`);

  // Categorise headers
  const sessionCols = headers.filter((h) => h.startsWith(SESSION_PREFIX));
  const venueCols = headers.filter((h) => h.startsWith(VENUE_PREFIX));
  const outcomeCols = headers.filter((h) => h.startsWith(OUTCOME_PREFIX));
  const dayPacingCols = headers.filter((h) => h.startsWith(DAY_PACING_PREFIX));

  console.log(`  Session rating columns: ${sessionCols.length}`);
  console.log(`  Venue rating columns: ${venueCols.length}`);
  console.log(`  Outcome rating columns: ${outcomeCols.length}`);
  console.log(`  Day pacing columns: ${dayPacingCols.length}\n`);

  // Identify day pacing reason columns
  // Pattern: "What reason/s influenced your rating?" (first one is for sessions),
  // then "What reason/s influenced your rating?1", "What reason/s influenced your rating?2",
  // or variants with \r\n. We need to find the ones that correspond to days 1-3.
  const reasonCols = headers.filter((h) =>
    h.startsWith('What reason/s influenced your rating?')
  );
  // First one (no suffix) = session_reasons
  // Subsequent ones = day pacing reasons for days 1, 2, 3
  const sessionReasonCol = reasonCols.find(
    (h) => h === 'What reason/s influenced your rating?'
  );
  const dayPacingReasonCols = reasonCols.filter(
    (h) => h !== 'What reason/s influenced your rating?'
  );

  // Parse each row
  const responses = rawRows.map((row) => {
    // Session ratings → JSONB
    const sessionRatings = {};
    for (const col of sessionCols) {
      const sessionName = stripPrefix(col, SESSION_PREFIX);
      sessionRatings[sessionName] = row[col] ?? null;
    }

    // Day pacing → JSONB { "Day 1": value, "Day 2": value, "Day 3": value }
    const dayPacing = {};
    for (const col of dayPacingCols) {
      // Extract "Day N" from "The amount of information on Day N was:"
      const match = col.match(/Day (\d+)/);
      if (match) {
        dayPacing[`Day ${match[1]}`] = row[col] ?? null;
      }
    }

    // Day pacing reasons → JSONB { "Day 1": text, "Day 2": text, "Day 3": text }
    const dayPacingReasons = {};
    dayPacingReasonCols.forEach((col, idx) => {
      dayPacingReasons[`Day ${idx + 1}`] = row[col] ?? null;
    });

    // Outcome ratings → JSONB
    const outcomeRatings = {};
    for (const col of outcomeCols) {
      const outcomeName = stripPrefix(col, OUTCOME_PREFIX);
      outcomeRatings[outcomeName] = row[col] ?? null;
    }

    // Venue ratings → JSONB
    const venueRatings = {};
    for (const col of venueCols) {
      const venueName = stripPrefix(col, VENUE_PREFIX);
      venueRatings[venueName] = row[col] ?? null;
    }

    // Scalar fields
    const name = row['Name'] || null;
    const email = row['Email'] || null;
    const isFirstTimeRaw = row['Is this your first APAC Compass?'];
    const isFirstTime =
      typeof isFirstTimeRaw === 'string'
        ? isFirstTimeRaw.trim().toLowerCase() === 'yes'
        : false;

    const sessionReasons = sessionReasonCol ? row[sessionReasonCol] || null : null;

    const keepRaw = row['What should we KEEP for 2027? (Select all that apply)'] || row['What should we KEEP for 2027?'] || null;
    const keepForNextYear = parseSemicolonArray(keepRaw);

    const changeOneThing =
      row['If you could change ONE thing...'] ??
      row[
        headers.find((h) => h.toLowerCase().startsWith('if you could change one thing'))
      ] ??
      null;

    const midYearInterestRaw =
      row['Would you be interested in a mid-year APAC Compass?'];
    const midYearInterest =
      typeof midYearInterestRaw === 'string'
        ? midYearInterestRaw.trim().toLowerCase() === 'yes'
        : false;

    const recommendScore =
      row['How likely are you to recommend...'] ??
      row[
        headers.find((h) => h.toLowerCase().startsWith('how likely are you to recommend'))
      ] ??
      null;

    const otherComments =
      row['Any other comments or feedback?'] || null;

    return {
      respondent_name: name,
      respondent_email: email,
      is_first_time: isFirstTime,
      session_ratings: sessionRatings,
      session_reasons: sessionReasons,
      day_pacing: Object.keys(dayPacing).length > 0 ? dayPacing : null,
      day_pacing_reasons:
        Object.keys(dayPacingReasons).length > 0 ? dayPacingReasons : null,
      outcome_ratings:
        Object.keys(outcomeRatings).length > 0 ? outcomeRatings : null,
      venue_ratings: Object.keys(venueRatings).length > 0 ? venueRatings : null,
      keep_for_next_year: keepForNextYear,
      change_one_thing: changeOneThing,
      mid_year_interest: midYearInterest,
      recommend_score:
        recommendScore != null ? parseInt(recommendScore, 10) : null,
      other_comments: otherComments,
    };
  });

  return responses;
}

// ---------------------------------------------------------------------------
// Import to Supabase
// ---------------------------------------------------------------------------
async function importToSupabase(responses) {
  const recommendScores = responses
    .map((r) => r.recommend_score)
    .filter((s) => s != null);
  const nps = computeNPS(recommendScores);
  const meanRecommend = computeMean(recommendScores);

  console.log('Computed metrics:');
  console.log(`  NPS: ${nps != null ? (nps >= 0 ? '+' : '') + nps : 'N/A'}`);
  console.log(`  Mean recommend score: ${meanRecommend ?? 'N/A'}`);
  console.log(`  Total responses: ${responses.length}\n`);

  // Step 1: Delete existing data for 2026 (idempotent re-runs)
  console.log('Cleaning existing 2026 data...');

  const { data: existingSurvey } = await supabase
    .from('compass_surveys')
    .select('id')
    .eq('year', SURVEY_YEAR)
    .single();

  if (existingSurvey) {
    // Responses cascade-delete with the survey
    const { error: delResponseErr } = await supabase
      .from('compass_responses')
      .delete()
      .eq('survey_id', existingSurvey.id);
    if (delResponseErr) {
      console.error('  Error deleting responses:', delResponseErr.message);
    }

    const { error: delSurveyErr } = await supabase
      .from('compass_surveys')
      .delete()
      .eq('year', SURVEY_YEAR);
    if (delSurveyErr) {
      console.error('  Error deleting survey:', delSurveyErr.message);
    } else {
      console.log('  Deleted existing survey + responses');
    }
  } else {
    console.log('  No existing 2026 survey found');
  }

  // Also clean compass_access for this year
  const { error: delAccessErr } = await supabase
    .from('compass_access')
    .delete()
    .eq('compass_year', SURVEY_YEAR);
  if (delAccessErr) {
    console.error('  Error deleting access rows:', delAccessErr.message);
  }

  // Step 2: Insert compass_surveys row
  console.log('\nInserting compass_surveys row...');
  const { data: survey, error: surveyErr } = await supabase
    .from('compass_surveys')
    .insert({
      year: SURVEY_YEAR,
      title: SURVEY_TITLE,
      location: SURVEY_LOCATION,
      date_start: SURVEY_DATE_START,
      date_end: SURVEY_DATE_END,
      total_responses: responses.length,
      nps_score: nps,
      mean_recommend: meanRecommend,
    })
    .select('id')
    .single();

  if (surveyErr || !survey) {
    console.error('Failed to insert survey:', surveyErr?.message);
    process.exit(1);
  }
  console.log(`  Survey ID: ${survey.id}`);

  // Step 3: Insert compass_responses rows
  console.log('\nInserting compass_responses rows...');
  const responseRows = responses.map((r) => ({
    survey_id: survey.id,
    respondent_name: r.respondent_name,
    respondent_email: r.respondent_email,
    is_first_time: r.is_first_time,
    session_ratings: r.session_ratings,
    session_reasons: r.session_reasons,
    day_pacing: r.day_pacing,
    day_pacing_reasons: r.day_pacing_reasons,
    outcome_ratings: r.outcome_ratings,
    venue_ratings: r.venue_ratings,
    keep_for_next_year: r.keep_for_next_year,
    change_one_thing: r.change_one_thing,
    mid_year_interest: r.mid_year_interest,
    recommend_score: r.recommend_score,
    other_comments: r.other_comments,
  }));

  const { error: responseErr } = await supabase
    .from('compass_responses')
    .insert(responseRows);

  if (responseErr) {
    console.error('Failed to insert responses:', responseErr.message);
    process.exit(1);
  }
  console.log(`  Inserted ${responseRows.length} responses`);

  // Step 4: Seed compass_access
  console.log('\nSeeding compass_access...');
  const { error: accessErr } = await supabase.from('compass_access').insert({
    user_email: 'dimitri.leimonitis@alterahealth.com',
    compass_year: SURVEY_YEAR,
    access_level: 'full',
    granted_by: 'import-script',
  });

  if (accessErr) {
    console.error('Failed to insert access:', accessErr.message);
  } else {
    console.log('  Granted full access to dimitri.leimonitis@alterahealth.com');
  }

  return { nps, meanRecommend };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60));
  console.log('APAC Compass 2026 Survey Import');
  console.log('='.repeat(60) + '\n');

  // Parse
  const responses = parseExcel();

  // Validate
  const invalid = responses.filter((r) => !r.respondent_name || !r.respondent_email);
  if (invalid.length > 0) {
    console.warn(
      `Warning: ${invalid.length} rows missing name or email — skipping these\n`
    );
  }
  const validResponses = responses.filter(
    (r) => r.respondent_name && r.respondent_email
  );

  if (validResponses.length === 0) {
    console.error('No valid responses found. Aborting.');
    process.exit(1);
  }

  // Import
  const { nps, meanRecommend } = await importToSupabase(validResponses);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Total responses: ${validResponses.length}`);
  console.log(`  NPS: ${nps != null ? (nps >= 0 ? '+' : '') + nps : 'N/A'}`);
  console.log(`  Mean recommend: ${meanRecommend ?? 'N/A'}`);
  console.log('  Respondents:');
  validResponses.forEach((r) => {
    console.log(`    - ${r.respondent_name} (${r.respondent_email})`);
  });
  console.log();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
