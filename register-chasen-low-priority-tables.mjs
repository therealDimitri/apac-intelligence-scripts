#!/usr/bin/env node
/**
 * Register Low Priority Tables with ChaSen Data Sources
 *
 * This script connects remaining low-priority tables to ChaSen AI:
 * - Audit logs and performance monitoring
 * - ChaSen learning and recommendation tables
 * - Reference data tables
 * - Cache and snapshot tables
 *
 * Run: node scripts/register-chasen-low-priority-tables.mjs
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Low priority tables with their configurations
// Schema: table_name, display_name, description, category, is_enabled, priority,
//         select_columns, order_by, limit_rows, filter_condition, time_filter_column,
//         time_filter_days, section_emoji, section_title, include_link
const lowPriorityTables = [
  // Audit & Performance
  {
    table_name: 'query_performance_logs',
    display_name: 'Query Performance',
    description: 'Database query performance metrics for system health monitoring',
    category: 'system',
    priority: 25,
    section_emoji: '⚡',
    section_title: 'Query Performance',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: 7,
    time_filter_column: 'created_at'
  },
  {
    table_name: 'slow_query_alerts',
    display_name: 'Slow Query Alerts',
    description: 'Alerts for database queries exceeding performance thresholds',
    category: 'system',
    priority: 20,
    section_emoji: '🐢',
    section_title: 'Slow Queries',
    filter_condition: null,
    limit_rows: 20,
    time_filter_days: 7,
    time_filter_column: 'created_at'
  },

  // ChaSen Learning & Recommendations
  {
    table_name: 'chasen_recommendations',
    display_name: 'AI Recommendations',
    description: 'Generated recommendations from ChaSen AI analysis',
    category: 'ai',
    priority: 42,
    section_emoji: '💡',
    section_title: 'AI Recommendations',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: 30,
    time_filter_column: 'created_at'
  },
  {
    table_name: 'chasen_recommendation_interactions',
    display_name: 'Recommendation Interactions',
    description: 'User interactions with AI recommendations (accepted, dismissed, modified)',
    category: 'ai',
    priority: 38,
    section_emoji: '👆',
    section_title: 'Recommendation Interactions',
    filter_condition: null,
    limit_rows: 100,
    time_filter_days: 30,
    time_filter_column: 'created_at'
  },
  {
    table_name: 'chasen_generation_log',
    display_name: 'Generation Log',
    description: 'Audit log of ChaSen AI content generation',
    category: 'ai',
    priority: 28,
    section_emoji: '📝',
    section_title: 'Generation Log',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: 14,
    time_filter_column: 'created_at'
  },
  {
    table_name: 'conversation_embeddings',
    display_name: 'Conversation Embeddings',
    description: 'Vector embeddings for semantic search across conversations',
    category: 'ai',
    priority: 32,
    section_emoji: '🔗',
    section_title: 'Conversation Embeddings',
    filter_condition: null,
    limit_rows: 100,
    time_filter_days: null,
    time_filter_column: null
  },

  // Assignment & Suggestions
  {
    table_name: 'cse_assignment_suggestions',
    display_name: 'CSE Assignment Suggestions',
    description: 'AI-suggested CSE-client assignment recommendations',
    category: 'team',
    priority: 35,
    section_emoji: '🎯',
    section_title: 'Assignment Suggestions',
    filter_condition: null,
    limit_rows: 30,
    time_filter_days: 30,
    time_filter_column: 'created_at'
  },

  // Cache & Snapshots
  {
    table_name: 'nps_insights_cache',
    display_name: 'NPS Insights Cache',
    description: 'Cached NPS analytics and insights for performance',
    category: 'analytics',
    priority: 22,
    section_emoji: '💾',
    section_title: 'NPS Insights Cache',
    filter_condition: null,
    limit_rows: 20,
    time_filter_days: 7,
    time_filter_column: 'created_at'
  },
  {
    table_name: 'client_metric_snapshots',
    display_name: 'Client Metric Snapshots',
    description: 'Point-in-time snapshots of client health and engagement metrics',
    category: 'analytics',
    priority: 30,
    section_emoji: '📸',
    section_title: 'Metric Snapshots',
    filter_condition: null,
    limit_rows: 100,
    time_filter_days: 90,
    time_filter_column: 'snapshot_date'
  },

  // Reference Data
  {
    table_name: 'llm_models',
    display_name: 'LLM Models',
    description: 'Available language models and their configurations',
    category: 'system',
    priority: 15,
    section_emoji: '🤖',
    section_title: 'LLM Models',
    filter_condition: 'is_active = true',
    limit_rows: 50,
    time_filter_days: null,
    time_filter_column: null
  },
  {
    table_name: 'tier_requirements',
    display_name: 'Tier Requirements',
    description: 'Segmentation tier requirements and expectations',
    category: 'reference',
    priority: 48,
    section_emoji: '📋',
    section_title: 'Tier Requirements',
    filter_condition: null,
    limit_rows: 20,
    time_filter_days: null,
    time_filter_column: null
  },

  // Financial Reference
  {
    table_name: 'burc_fiscal_years',
    display_name: 'BURC Fiscal Years',
    description: 'Fiscal year definitions for financial reporting',
    category: 'financial',
    priority: 18,
    section_emoji: '📅',
    section_title: 'Fiscal Years',
    filter_condition: null,
    limit_rows: 10,
    time_filter_days: null,
    time_filter_column: null
  },
  {
    table_name: 'burc_revenue_targets',
    display_name: 'Revenue Targets',
    description: 'Annual revenue targets by region and segment',
    category: 'financial',
    priority: 36,
    section_emoji: '🎯',
    section_title: 'Revenue Targets',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: null,
    time_filter_column: null
  },

  // Product Reference
  {
    table_name: 'product_categories',
    display_name: 'Product Categories',
    description: 'Product category classifications',
    category: 'reference',
    priority: 24,
    section_emoji: '📦',
    section_title: 'Product Categories',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: null,
    time_filter_column: null
  },

  // Integration & Webhooks
  {
    table_name: 'webhook_subscriptions',
    display_name: 'Webhook Subscriptions',
    description: 'Active webhook integrations and their configurations',
    category: 'system',
    priority: 12,
    section_emoji: '🔌',
    section_title: 'Webhooks',
    filter_condition: null,
    limit_rows: 30,
    time_filter_days: null,
    time_filter_column: null
  },

  // Calendar Sync
  {
    table_name: 'skipped_outlook_events',
    display_name: 'Skipped Calendar Events',
    description: 'Outlook events skipped during calendar sync',
    category: 'system',
    priority: 10,
    section_emoji: '📅',
    section_title: 'Skipped Events',
    filter_condition: null,
    limit_rows: 50,
    time_filter_days: 30,
    time_filter_column: 'created_at'
  }
]

async function main() {
  console.log('=== ChaSen Low Priority Tables Registration ===\n')

  // Get already registered tables
  const { data: registered } = await supabase
    .from('chasen_data_sources')
    .select('table_name')
    .eq('is_enabled', true)
  const registeredSet = new Set(registered?.map(r => r.table_name) || [])

  console.log(`Currently registered: ${registeredSet.size} tables\n`)

  const results = {
    registered: [],
    alreadyExists: [],
    tableNotFound: [],
    errors: []
  }

  for (const tableConfig of lowPriorityTables) {
    // Check if already registered
    if (registeredSet.has(tableConfig.table_name)) {
      results.alreadyExists.push(tableConfig.table_name)
      continue
    }

    // Check if table exists
    const { error: checkError } = await supabase
      .from(tableConfig.table_name)
      .select('*', { count: 'exact', head: true })

    if (checkError) {
      results.tableNotFound.push(tableConfig.table_name)
      continue
    }

    // Register the table with correct column names
    const { error: insertError } = await supabase
      .from('chasen_data_sources')
      .upsert({
        table_name: tableConfig.table_name,
        display_name: tableConfig.display_name,
        description: tableConfig.description,
        category: tableConfig.category,
        is_enabled: true,
        priority: tableConfig.priority,
        select_columns: ['*'], // Select all columns
        order_by: tableConfig.time_filter_column ? `${tableConfig.time_filter_column} DESC` : null,
        limit_rows: tableConfig.limit_rows,
        filter_condition: tableConfig.filter_condition,
        time_filter_column: tableConfig.time_filter_column,
        time_filter_days: tableConfig.time_filter_days,
        section_emoji: tableConfig.section_emoji,
        section_title: tableConfig.section_title,
        include_link: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'table_name' })

    if (insertError) {
      results.errors.push({ table: tableConfig.table_name, error: insertError.message })
    } else {
      results.registered.push(tableConfig.table_name)
    }
  }

  // Print results
  console.log('=== Results ===\n')

  if (results.registered.length > 0) {
    console.log(`✅ Newly Registered (${results.registered.length}):`)
    results.registered.forEach(t => console.log(`   - ${t}`))
  }

  if (results.alreadyExists.length > 0) {
    console.log(`\n⏭️  Already Registered (${results.alreadyExists.length}):`)
    results.alreadyExists.forEach(t => console.log(`   - ${t}`))
  }

  if (results.tableNotFound.length > 0) {
    console.log(`\n❌ Table Not Found (${results.tableNotFound.length}):`)
    results.tableNotFound.forEach(t => console.log(`   - ${t}`))
  }

  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors (${results.errors.length}):`)
    results.errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`))
  }

  // Get final count
  const { count } = await supabase
    .from('chasen_data_sources')
    .select('*', { count: 'exact', head: true })
    .eq('is_enabled', true)

  console.log(`\n=== Summary ===`)
  console.log(`Total active data sources: ${count}`)
  console.log(`New tables registered: ${results.registered.length}`)
}

main().catch(console.error)
