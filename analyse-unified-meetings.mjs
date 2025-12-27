#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  const { data } = await supabase.from('unified_meetings').select('*').limit(1)
  const cols = Object.keys(data?.[0] || {})

  // Categorise columns for normalisation
  const categories = {
    'Core Meeting (keep in main table)': [
      'id',
      'meeting_id',
      'title',
      'client_name',
      'client_uuid',
      'client_id',
      'cse_name',
      'meeting_date',
      'meeting_time',
      'duration',
      'meeting_type',
      'status',
      'is_internal',
      'deleted',
      'created_at',
      'updated_at',
    ],
    'Content → meeting_content': [
      'meeting_notes',
      'transcript',
      'transcript_file_url',
      'recording_url',
      'recording_file_url',
    ],
    'AI Analysis → meeting_ai_analysis': [
      'ai_analyzed',
      'ai_summary',
      'ai_confidence_score',
      'ai_tokens_used',
      'ai_cost',
      'analyzed_at',
    ],
    'Sentiment → meeting_sentiment': [
      'sentiment_overall',
      'sentiment_score',
      'sentiment_client',
      'sentiment_cse',
    ],
    'Effectiveness → meeting_effectiveness': [
      'effectiveness_overall',
      'effectiveness_preparation',
      'effectiveness_participation',
      'effectiveness_clarity',
      'effectiveness_outcomes',
      'effectiveness_follow_up',
      'effectiveness_time_management',
    ],
    'Extracted Data → meeting_insights': [
      'topics',
      'risks',
      'highlights',
      'next_steps',
      'decisions',
      'resources',
    ],
    'Outlook/Teams → meeting_sync': [
      'outlook_event_id',
      'teams_meeting_id',
      'synced_to_outlook',
      'attendees',
      'organizer',
    ],
    'Department → meeting_classification': [
      'meeting_dept',
      'department_code',
      'activity_type_code',
      'cross_functional',
      'linked_initiative_id',
    ],
  }

  console.log('unified_meetings Column Analysis')
  console.log('='.repeat(60))
  console.log('Total columns:', cols.length)
  console.log()

  let totalCategorised = 0
  for (const [cat, catCols] of Object.entries(categories)) {
    const matching = catCols.filter(c => cols.includes(c))
    totalCategorised += matching.length
    console.log(`${cat} (${matching.length}):`)
    console.log(`  ${matching.join(', ')}`)
    console.log()
  }

  // Find uncategorised
  const allCat = Object.values(categories).flat()
  const uncategorised = cols.filter(c => !allCat.includes(c))
  if (uncategorised.length > 0) {
    console.log('Uncategorised:', uncategorised.join(', '))
  }

  console.log('='.repeat(60))
  console.log('Normalisation Plan:')
  console.log('  - Keep 16 core columns in unified_meetings')
  console.log('  - Extract 5 content columns → meeting_content')
  console.log('  - Extract 6 AI columns → meeting_ai_analysis')
  console.log('  - Extract 4 sentiment columns → meeting_sentiment')
  console.log('  - Extract 7 effectiveness columns → meeting_effectiveness')
  console.log('  - Extract 6 insights columns → meeting_insights')
  console.log('  - Extract 5 sync columns → meeting_sync')
  console.log('  - Extract 5 classification columns → meeting_classification')
  console.log()
  console.log('Benefits:')
  console.log('  - Reduced table width: 54 → 16 columns')
  console.log('  - Better query performance for common operations')
  console.log('  - Logical grouping of related data')
  console.log('  - Easier to add new fields to specific categories')
}

run().catch(console.error)
