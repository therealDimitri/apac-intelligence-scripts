/**
 * Register new data sources with ChaSen AI
 *
 * Adds portfolio_initiatives, topics, and health_status_alerts as data sources
 * so ChaSen can include them in its context and respond to questions about them.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const dataSources = [
  {
    table_name: 'portfolio_initiatives',
    display_name: 'Portfolio Initiatives',
    description: 'Strategic initiatives and programs for clients tracked by year',
    category: 'client',
    priority: 75,
    select_columns: ['id', 'name', 'client_name', 'cse_name', 'year', 'status', 'category', 'description', 'start_date', 'completion_date'],
    order_by: 'year DESC',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🎯',
    section_title: 'Portfolio Initiatives',
    include_link: '/client-profiles',
    is_enabled: true,
  },
  {
    table_name: 'topics',
    display_name: 'Meeting Topics',
    description: 'Discussion topics from client meetings with summaries',
    category: 'client',
    priority: 60,
    select_columns: ['id', 'Meeting_Date', 'Topic_Number', 'Topic_Title', 'Topic_Summary', 'Background'],
    order_by: 'Meeting_Date DESC',
    limit_rows: 15,
    filter_condition: null,
    time_filter_column: 'Meeting_Date',
    time_filter_days: 90,
    section_emoji: '💬',
    section_title: 'Recent Meeting Topics',
    include_link: '/meetings',
    is_enabled: true,
  },
  {
    table_name: 'health_status_alerts',
    display_name: 'Health Status Alerts',
    description: 'Client health score changes and alerts requiring attention',
    category: 'client',
    priority: 85,
    select_columns: ['id', 'client_name', 'alert_date', 'previous_status', 'new_status', 'previous_score', 'new_score', 'direction', 'acknowledged'],
    order_by: 'alert_date DESC',
    limit_rows: 10,
    filter_condition: null,
    time_filter_column: 'alert_date',
    time_filter_days: 30,
    section_emoji: '🏥',
    section_title: 'Health Status Changes',
    include_link: '/alerts',
    is_enabled: true,
  },
]

async function registerDataSources() {
  console.log('Registering ChaSen data sources...\n')

  for (const source of dataSources) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('chasen_data_sources')
      .select('id')
      .eq('table_name', source.table_name)
      .single()

    if (existing) {
      console.log(`✓ ${source.display_name} already registered, updating...`)
      const { error } = await supabase
        .from('chasen_data_sources')
        .update(source)
        .eq('table_name', source.table_name)

      if (error) {
        console.error(`  ✗ Failed to update: ${error.message}`)
      } else {
        console.log(`  ✓ Updated successfully`)
      }
    } else {
      console.log(`+ Adding ${source.display_name}...`)
      const { error } = await supabase
        .from('chasen_data_sources')
        .insert(source)

      if (error) {
        console.error(`  ✗ Failed to insert: ${error.message}`)
      } else {
        console.log(`  ✓ Added successfully`)
      }
    }
  }

  // Verify registration
  console.log('\n--- Verifying registered sources ---')
  const { data: all, error } = await supabase
    .from('chasen_data_sources')
    .select('table_name, display_name, is_enabled, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('Failed to verify:', error.message)
  } else {
    console.log(`\nTotal enabled data sources: ${all.length}`)
    all.forEach(s => {
      console.log(`  [${s.priority}] ${s.display_name} (${s.table_name})`)
    })
  }

  console.log('\n✅ ChaSen data sources registration complete!')
}

registerDataSources().catch(console.error)
