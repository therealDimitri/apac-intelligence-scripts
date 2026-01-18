/**
 * Register High & Medium Priority Data Sources with ChaSen AI
 *
 * Date: 2026-01-19
 * Purpose: Connect all identified high and medium priority tables to ChaSen
 *          for maximum AI intelligence through complete data access.
 *
 * Reference: docs/features/CHASEN-DATA-ACCESS-AUDIT.md
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

// ============================================================================
// HIGH PRIORITY DATA SOURCES (13 tables)
// ============================================================================
const highPriorityDataSources = [
  {
    table_name: 'support_sla_metrics',
    display_name: 'Support SLA Metrics',
    description: 'Support ticket metrics, SLA compliance, and case volume tracking',
    category: 'operations',
    priority: 88,
    select_columns: ['client_name', 'period_end', 'total_incoming', 'total_closed', 'backlog', 'critical_open', 'high_open', 'response_sla_percent', 'resolution_sla_percent', 'satisfaction_score'],
    order_by: 'period_end DESC',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: 'period_end',
    time_filter_days: 90,
    section_emoji: '🎫',
    section_title: 'Support SLA Metrics',
    include_link: '/support',
    is_enabled: true,
  },
  {
    table_name: 'support_case_details',
    display_name: 'Support Cases',
    description: 'Individual support case details with priority and state',
    category: 'operations',
    priority: 82,
    select_columns: ['client_name', 'case_number', 'short_description', 'priority', 'state', 'opened_at', 'assigned_to', 'product', 'has_breached'],
    order_by: 'opened_at DESC',
    limit_rows: 15,
    filter_condition: "state NOT IN ('Closed', 'Resolved')",
    time_filter_column: 'opened_at',
    time_filter_days: 60,
    section_emoji: '📋',
    section_title: 'Open Support Cases',
    include_link: '/support',
    is_enabled: true,
  },
  {
    table_name: 'account_plan_ai_insights',
    display_name: 'AI Account Insights',
    description: 'AI-generated insights for account plans including risks and opportunities',
    category: 'analytics',
    priority: 92,
    select_columns: ['client_name', 'insight_type', 'title', 'description', 'confidence_score', 'priority', 'impact_score', 'recommended_actions'],
    order_by: 'created_at DESC',
    limit_rows: 20,
    filter_condition: 'is_dismissed = false',
    time_filter_column: 'created_at',
    time_filter_days: 30,
    section_emoji: '💡',
    section_title: 'AI Account Insights',
    include_link: '/planning',
    is_enabled: true,
  },
  {
    table_name: 'next_best_actions',
    display_name: 'Next Best Actions',
    description: 'AI-recommended prioritised actions for CSEs/CAMs',
    category: 'analytics',
    priority: 91,
    select_columns: ['client_name', 'cse_name', 'action_type', 'title', 'description', 'priority_score', 'urgency_level', 'trigger_reason', 'status'],
    order_by: 'priority_score DESC',
    limit_rows: 15,
    filter_condition: "status = 'pending'",
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🎯',
    section_title: 'Recommended Actions',
    include_link: '/actions',
    is_enabled: true,
  },
  {
    table_name: 'predictive_health_scores',
    display_name: 'Predictive Health',
    description: 'ML-predicted health scores, churn risk, and expansion probability',
    category: 'analytics',
    priority: 94,
    select_columns: ['client_name', 'calculation_date', 'current_health_score', 'predicted_health_30d', 'predicted_health_90d', 'churn_risk_score', 'expansion_probability', 'risk_factors', 'confidence_score'],
    order_by: 'churn_risk_score DESC',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: 'calculation_date',
    time_filter_days: 7,
    section_emoji: '🔮',
    section_title: 'Health Predictions & Risk',
    include_link: '/client-profiles',
    is_enabled: true,
  },
  {
    table_name: 'meddpicc_scores',
    display_name: 'MEDDPICC Scores',
    description: 'Detailed MEDDPICC scoring with AI-assisted gap analysis',
    category: 'analytics',
    priority: 78,
    select_columns: ['client_name', 'opportunity_name', 'overall_score', 'metrics_score', 'economic_buyer_score', 'champion_score', 'gap_analysis', 'recommended_actions'],
    order_by: 'updated_at DESC',
    limit_rows: 15,
    filter_condition: null,
    time_filter_column: 'updated_at',
    time_filter_days: 30,
    section_emoji: '📊',
    section_title: 'MEDDPICC Analysis',
    include_link: '/planning',
    is_enabled: true,
  },
  {
    table_name: 'stakeholder_relationships',
    display_name: 'Stakeholder Relationships',
    description: 'Client stakeholder mapping with roles, influence, and sentiment',
    category: 'client',
    priority: 80,
    select_columns: ['client_name', 'stakeholder_name', 'stakeholder_title', 'stakeholder_role', 'meddpicc_role', 'influence_level', 'sentiment', 'relationship_strength', 'is_decision_maker'],
    order_by: 'influence_level DESC',
    limit_rows: 25,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '👥',
    section_title: 'Key Stakeholders',
    include_link: '/planning',
    is_enabled: true,
  },
  {
    table_name: 'stakeholder_influences',
    display_name: 'Stakeholder Influence Map',
    description: 'Influence relationships between stakeholders for org chart visualisation',
    category: 'client',
    priority: 72,
    select_columns: ['from_stakeholder_id', 'to_stakeholder_id', 'influence_type', 'influence_strength'],
    order_by: 'influence_strength DESC',
    limit_rows: 30,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🔗',
    section_title: 'Influence Relationships',
    include_link: '/planning',
    is_enabled: true,
  },
  {
    table_name: 'engagement_timeline',
    display_name: 'Engagement Timeline',
    description: 'Denormalised timeline of all client touchpoints (meetings, NPS, actions, etc.)',
    category: 'client',
    priority: 84,
    select_columns: ['client_name', 'event_type', 'event_date', 'event_title', 'event_summary', 'sentiment', 'participants', 'key_topics'],
    order_by: 'event_date DESC',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: 'event_date',
    time_filter_days: 30,
    section_emoji: '📅',
    section_title: 'Recent Engagement',
    include_link: '/clients',
    is_enabled: true,
  },
  {
    table_name: 'client_arr',
    display_name: 'Client ARR',
    description: 'Annual Recurring Revenue tracking with contract dates and growth',
    category: 'client',
    priority: 89,
    select_columns: ['client_name', 'arr_usd', 'contract_start_date', 'contract_end_date', 'contract_renewal_date', 'growth_percentage', 'notes'],
    order_by: 'arr_usd DESC',
    limit_rows: 30,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '💰',
    section_title: 'Client Revenue (ARR)',
    include_link: '/burc',
    is_enabled: true,
  },
]

// ============================================================================
// MEDIUM PRIORITY DATA SOURCES (12 tables)
// ============================================================================
const mediumPriorityDataSources = [
  {
    table_name: 'segmentation_event_types',
    display_name: 'Event Type Definitions',
    description: 'Official Altera APAC event types with frequencies and descriptions',
    category: 'system',
    priority: 55,
    select_columns: ['event_name', 'event_code', 'frequency_type', 'avg_effectiveness_score', 'total_completions'],
    order_by: 'event_name',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '📋',
    section_title: 'Event Types',
    include_link: '/segmentation',
    is_enabled: true,
  },
  {
    table_name: 'segmentation_events',
    display_name: 'Segmentation Events',
    description: 'Individual client events with completion status and effectiveness',
    category: 'operations',
    priority: 68,
    select_columns: ['client_name', 'event_type_id', 'event_date', 'completed', 'effectiveness_score'],
    order_by: 'event_date DESC',
    limit_rows: 25,
    filter_condition: null,
    time_filter_column: 'event_date',
    time_filter_days: 90,
    section_emoji: '📆',
    section_title: 'Recent Events',
    include_link: '/segmentation',
    is_enabled: true,
  },
  {
    table_name: 'segmentation_event_compliance',
    display_name: 'Event Compliance',
    description: 'Event-type level compliance tracking per client per year',
    category: 'analytics',
    priority: 70,
    select_columns: ['client_name', 'event_type_id', 'year', 'expected_count', 'actual_count', 'compliance_percentage', 'status'],
    order_by: 'compliance_percentage ASC',
    limit_rows: 30,
    filter_condition: "year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER",
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '✅',
    section_title: 'Event Compliance',
    include_link: '/compliance',
    is_enabled: true,
  },
  {
    table_name: 'segmentation_compliance_scores',
    display_name: 'Compliance Scores',
    description: 'Overall compliance scores per client per year',
    category: 'analytics',
    priority: 72,
    select_columns: ['client_name', 'year', 'segment', 'compliance_score', 'status'],
    order_by: 'compliance_score ASC',
    limit_rows: 30,
    filter_condition: "year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER",
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '📈',
    section_title: 'Compliance Scores',
    include_link: '/compliance',
    is_enabled: true,
  },
  {
    table_name: 'cse_profiles',
    display_name: 'CSE Profiles',
    description: 'CSE team structure with roles and reporting relationships',
    category: 'system',
    priority: 58,
    select_columns: ['name', 'email', 'role', 'reports_to', 'job_description'],
    order_by: 'name',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '👤',
    section_title: 'CSE Team',
    include_link: '/team-performance',
    is_enabled: true,
  },
  {
    table_name: 'cse_client_assignments',
    display_name: 'CSE Assignments',
    description: 'CSE to client mapping with assignment dates',
    category: 'system',
    priority: 56,
    select_columns: ['cse_name', 'client_name', 'assigned_date', 'is_primary'],
    order_by: 'assigned_date DESC',
    limit_rows: 50,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🔗',
    section_title: 'Client Assignments',
    include_link: '/team-performance',
    is_enabled: true,
  },
  {
    table_name: 'user_preferences',
    display_name: 'User Preferences',
    description: 'User dashboard and notification preferences',
    category: 'system',
    priority: 40,
    select_columns: ['user_email', 'default_view', 'notification_settings', 'theme'],
    order_by: 'user_email',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '⚙️',
    section_title: 'User Preferences',
    include_link: '/settings',
    is_enabled: true,
  },
  {
    table_name: 'client_email_domains',
    display_name: 'Client Email Domains',
    description: 'Email domain to client mapping for meeting identification',
    category: 'system',
    priority: 45,
    select_columns: ['client_id', 'domain', 'is_primary'],
    order_by: 'domain',
    limit_rows: 50,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '📧',
    section_title: 'Email Domains',
    include_link: null,
    is_enabled: true,
  },
  {
    table_name: 'burc_critical_suppliers',
    display_name: 'Critical Suppliers',
    description: 'Vendor risk tracking and critical supplier information',
    category: 'analytics',
    priority: 62,
    select_columns: ['client_name', 'supplier_name', 'risk_level', 'contract_value', 'contract_end_date'],
    order_by: 'risk_level DESC',
    limit_rows: 20,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🏢',
    section_title: 'Critical Suppliers',
    include_link: '/burc',
    is_enabled: true,
  },
  {
    table_name: 'client_products_detailed',
    display_name: 'Client Products',
    description: 'Product deployments per client with status and implementation dates',
    category: 'client',
    priority: 65,
    select_columns: ['client_name', 'product_name', 'product_category', 'implementation_date', 'status'],
    order_by: 'client_name',
    limit_rows: 50,
    filter_condition: "status = 'active'",
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '📦',
    section_title: 'Client Products',
    include_link: '/client-profiles',
    is_enabled: true,
  },
  {
    table_name: 'products',
    display_name: 'Product Catalogue',
    description: 'Product catalogue with categories and descriptions',
    category: 'system',
    priority: 48,
    select_columns: ['code', 'name', 'category', 'description', 'colour'],
    order_by: 'category, name',
    limit_rows: 30,
    filter_condition: null,
    time_filter_column: null,
    time_filter_days: null,
    section_emoji: '🛒',
    section_title: 'Product Catalogue',
    include_link: null,
    is_enabled: true,
  },
  {
    table_name: 'user_logins',
    display_name: 'User Activity',
    description: 'User login audit log for activity tracking',
    category: 'system',
    priority: 35,
    select_columns: ['user_email', 'login_timestamp', 'login_source'],
    order_by: 'login_timestamp DESC',
    limit_rows: 30,
    filter_condition: null,
    time_filter_column: 'login_timestamp',
    time_filter_days: 7,
    section_emoji: '🔐',
    section_title: 'Recent User Activity',
    include_link: null,
    is_enabled: true,
  },
]

// Combine all data sources
const allDataSources = [...highPriorityDataSources, ...mediumPriorityDataSources]

async function verifyTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (error) {
      // Check if error is "relation does not exist"
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { exists: false, error: error.message }
      }
      // Other errors (e.g., RLS) - table exists but may have access issues
      return { exists: true, rowCount: 0, warning: error.message }
    }

    // Get row count
    const { count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    return { exists: true, rowCount: count || 0 }
  } catch (err) {
    return { exists: false, error: err.message }
  }
}

async function registerDataSources() {
  console.log('=' .repeat(70))
  console.log('ChaSen AI Data Source Registration - High & Medium Priority Tables')
  console.log('=' .repeat(70))
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Total tables to register: ${allDataSources.length}`)
  console.log(`  - High priority: ${highPriorityDataSources.length}`)
  console.log(`  - Medium priority: ${mediumPriorityDataSources.length}`)
  console.log('')

  const results = {
    registered: [],
    updated: [],
    skipped: [],
    failed: []
  }

  // First, verify all tables exist
  console.log('--- Phase 1: Verifying table existence ---\n')

  const tableVerification = []
  for (const source of allDataSources) {
    const result = await verifyTableExists(source.table_name)
    tableVerification.push({ ...source, verification: result })

    if (result.exists) {
      const icon = result.warning ? '⚠️' : '✓'
      console.log(`${icon} ${source.table_name} - ${result.rowCount} rows${result.warning ? ` (${result.warning})` : ''}`)
    } else {
      console.log(`✗ ${source.table_name} - TABLE NOT FOUND: ${result.error}`)
    }
  }

  const existingTables = tableVerification.filter(t => t.verification.exists)
  const missingTables = tableVerification.filter(t => !t.verification.exists)

  console.log(`\nTable verification complete:`)
  console.log(`  ✓ Found: ${existingTables.length}`)
  console.log(`  ✗ Missing: ${missingTables.length}`)

  if (missingTables.length > 0) {
    console.log(`\nMissing tables (will be skipped):`)
    missingTables.forEach(t => console.log(`  - ${t.table_name}`))
  }

  // Phase 2: Register existing tables
  console.log('\n--- Phase 2: Registering data sources ---\n')

  for (const source of existingTables) {
    const { verification, ...sourceData } = source

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('chasen_data_sources')
        .select('id, priority')
        .eq('table_name', sourceData.table_name)
        .single()

      if (existing) {
        // Update existing entry
        const { error } = await supabase
          .from('chasen_data_sources')
          .update(sourceData)
          .eq('table_name', sourceData.table_name)

        if (error) {
          console.log(`✗ ${sourceData.display_name} - Update failed: ${error.message}`)
          results.failed.push({ name: sourceData.table_name, error: error.message })
        } else {
          console.log(`↻ ${sourceData.display_name} (${sourceData.table_name}) - Updated [priority: ${existing.priority} → ${sourceData.priority}]`)
          results.updated.push(sourceData.table_name)
        }
      } else {
        // Insert new entry
        const { error } = await supabase
          .from('chasen_data_sources')
          .insert(sourceData)

        if (error) {
          console.log(`✗ ${sourceData.display_name} - Insert failed: ${error.message}`)
          results.failed.push({ name: sourceData.table_name, error: error.message })
        } else {
          console.log(`+ ${sourceData.display_name} (${sourceData.table_name}) - Registered [priority: ${sourceData.priority}]`)
          results.registered.push(sourceData.table_name)
        }
      }
    } catch (err) {
      console.log(`✗ ${sourceData.display_name} - Error: ${err.message}`)
      results.failed.push({ name: sourceData.table_name, error: err.message })
    }
  }

  // Mark missing tables as skipped
  missingTables.forEach(t => results.skipped.push(t.table_name))

  // Phase 3: Verification
  console.log('\n--- Phase 3: Verification ---\n')

  const { data: allEnabled, error: verifyError } = await supabase
    .from('chasen_data_sources')
    .select('table_name, display_name, category, priority, is_enabled')
    .eq('is_enabled', true)
    .order('priority', { ascending: false })

  if (verifyError) {
    console.log(`Failed to verify: ${verifyError.message}`)
  } else {
    console.log(`Total enabled data sources: ${allEnabled.length}\n`)

    // Group by category
    const byCategory = {}
    allEnabled.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = []
      byCategory[s.category].push(s)
    })

    for (const [category, sources] of Object.entries(byCategory)) {
      console.log(`[${category.toUpperCase()}] (${sources.length} sources)`)
      sources.forEach(s => {
        console.log(`  [${String(s.priority).padStart(2)}] ${s.display_name}`)
      })
      console.log('')
    }
  }

  // Summary
  console.log('=' .repeat(70))
  console.log('SUMMARY')
  console.log('=' .repeat(70))
  console.log(`✓ Newly registered: ${results.registered.length}`)
  console.log(`↻ Updated: ${results.updated.length}`)
  console.log(`⊘ Skipped (table not found): ${results.skipped.length}`)
  console.log(`✗ Failed: ${results.failed.length}`)

  if (results.skipped.length > 0) {
    console.log(`\nSkipped tables:`)
    results.skipped.forEach(t => console.log(`  - ${t}`))
  }

  if (results.failed.length > 0) {
    console.log(`\nFailed registrations:`)
    results.failed.forEach(t => console.log(`  - ${t.name}: ${t.error}`))
  }

  console.log('\n✅ ChaSen data source registration complete!')
  console.log('   ChaSen will now include data from these tables in its context.')
}

registerDataSources().catch(console.error)
