#!/usr/bin/env node
/**
 * Create the chasen_knowledge table using direct PostgreSQL connection
 * Uses the pg package to execute DDL statements
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const { Client } = pg

// Prefer direct connection for DDL operations
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment')
  process.exit(1)
}

const createTableSQL = `
-- ChaSen Knowledge Base Table
CREATE TABLE IF NOT EXISTS chasen_knowledge (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL,
    knowledge_key TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT,
    UNIQUE(category, knowledge_key)
);
`

const createIndexesSQL = `
-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chasen_knowledge_category ON chasen_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_chasen_knowledge_active ON chasen_knowledge(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chasen_knowledge_priority ON chasen_knowledge(priority DESC);
`

const enableRLSSQL = `
-- Enable RLS
ALTER TABLE chasen_knowledge ENABLE ROW LEVEL SECURITY;
`

const createPoliciesSQL = `
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "chasen_knowledge_select_policy" ON chasen_knowledge;
DROP POLICY IF EXISTS "chasen_knowledge_all_policy" ON chasen_knowledge;

-- Create RLS policies
-- Allow all users to read active entries
CREATE POLICY "chasen_knowledge_select_policy"
  ON chasen_knowledge FOR SELECT
  USING (is_active = true);

-- Allow service role full access
CREATE POLICY "chasen_knowledge_all_policy"
  ON chasen_knowledge FOR ALL
  USING (true)
  WITH CHECK (true);
`

async function createKnowledgeTable() {
  console.log('=' .repeat(60))
  console.log('Creating ChaSen Knowledge Table via Direct Postgres Connection')
  console.log('=' .repeat(60))
  console.log('')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('Connecting to Postgres...')
    await client.connect()
    console.log('Connected successfully!')
    console.log('')

    // Check if table already exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chasen_knowledge'
      );
    `)

    if (checkResult.rows[0].exists) {
      console.log('chasen_knowledge table already exists!')
      console.log('Verifying structure...')

      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'chasen_knowledge'
        ORDER BY ordinal_position;
      `)

      console.log('Table columns:')
      columnsResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`)
      })

      // Still run data insertion
      await insertInitialData()
      return true
    }

    // Create table
    console.log('Creating chasen_knowledge table...')
    await client.query(createTableSQL)
    console.log('Table created!')

    // Create indexes
    console.log('Creating indexes...')
    await client.query(createIndexesSQL)
    console.log('Indexes created!')

    // Enable RLS
    console.log('Enabling Row Level Security...')
    await client.query(enableRLSSQL)
    console.log('RLS enabled!')

    // Create policies
    console.log('Creating RLS policies...')
    await client.query(createPoliciesSQL)
    console.log('Policies created!')

    console.log('')
    console.log('=' .repeat(60))
    console.log('ChaSen Knowledge table created successfully!')
    console.log('=' .repeat(60))

    // Insert initial data
    await insertInitialData()

    return true
  } catch (error) {
    console.error('Error:', error.message)
    if (error.code) {
      console.error('Code:', error.code)
    }
    return false
  } finally {
    await client.end()
  }
}

async function insertInitialData() {
  console.log('\n📥 Inserting initial knowledge entries...')

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const knowledgeEntries = [
    {
      category: 'formulas',
      knowledge_key: 'health_score',
      title: 'Client Health Score Formula',
      content: `**Health Score Calculation (2-Component System)**

The health score is calculated using two components:

1. **NPS Score Component (40 points max)**
   - Formula: ((nps_score + 100) / 200) * 40
   - Converts NPS range (-100 to +100) to 0-40 points
   - Example: NPS of +50 = ((50 + 100) / 200) * 40 = 30 points

2. **Segmentation Compliance Component (60 points max)**
   - Formula: (compliance_percentage / 100) * 60
   - Directly proportional to event completion rate
   - Capped at 100% compliance to prevent overflow

**Thresholds:**
- Healthy: >= 70 points
- At-Risk: 60-69 points
- Focus Required: < 60 points

**Last Updated:** December 2024 (Simplified from previous 5-component system)`,
      priority: 100,
      metadata: { version: '2.0', components: ['nps', 'compliance'], weights: { nps: 40, compliance: 60 } },
      is_active: true
    },
    {
      category: 'business_rules',
      knowledge_key: 'nps_schedule',
      title: 'NPS Survey Schedule',
      content: `**NPS Survey Timing**

NPS surveys are conducted **twice per year** only:
- Q2 (April-June)
- Q4 (October-December)

**Important Implications:**
- NPS data will NOT be available for "last 30 days" queries - this is impossible
- Lack of recent NPS responses is NORMAL and EXPECTED
- Never recommend collecting more frequent NPS data
- Focus on quarter-over-quarter trends (Q2 vs Q4) not monthly/daily trends
- Latest NPS data is always from the most recent survey period`,
      priority: 90,
      metadata: { survey_quarters: ['Q2', 'Q4'], frequency: 'biannual' },
      is_active: true
    },
    {
      category: 'definitions',
      knowledge_key: 'client_segments',
      title: 'Client Segment Definitions',
      content: `**Client Segments**

1. **Giant** - Largest enterprise clients with complex needs
2. **Large** - Significant accounts requiring dedicated attention
3. **Medium** - Mid-tier clients with standard engagement
4. **Small** - Smaller accounts with lighter touch engagement
5. **NZ** - New Zealand specific clients
6. **Dormant** - Inactive or minimal engagement clients

Each segment has specific compliance event requirements defined in the segmentation_events table.`,
      priority: 80,
      metadata: { segments: ['Giant', 'Large', 'Medium', 'Small', 'NZ', 'Dormant'] },
      is_active: true
    },
    {
      category: 'processes',
      knowledge_key: 'engagement_events',
      title: 'Engagement Event Types',
      content: `**Required Engagement Events by Type**

- **QBR (Quarterly Business Review)** - Strategic review meeting
- **EBR (Executive Business Review)** - Executive-level strategic discussion
- **Regular Check-in** - Routine engagement touchpoint
- **Training** - Product or process training session
- **Support Review** - Review of support tickets and issues
- **Go-Live** - Implementation milestone meeting
- **Planning** - Forward-looking strategy session

Each segment has different required frequencies for these events.`,
      priority: 70,
      metadata: { event_types: ['QBR', 'EBR', 'Regular Check-in', 'Training', 'Support Review', 'Go-Live', 'Planning'] },
      is_active: true
    },
    {
      category: 'definitions',
      knowledge_key: 'aging_compliance',
      title: 'Aging Accounts Compliance',
      content: `**Accounts Receivable Aging Goals**

- **Target:** 100% of receivables under 90 days old
- **Secondary Target:** 90% of receivables under 60 days old

**Aging Buckets:**
- Current (0-30 days)
- 31-60 days
- 61-90 days
- 91-120 days
- Over 120 days

CSEs are measured on their portfolio aging compliance, with focus on minimising receivables over 90 days.`,
      priority: 60,
      metadata: { targets: { under_90_days: 100, under_60_days: 90 } },
      is_active: true
    }
  ]

  let successCount = 0

  for (const entry of knowledgeEntries) {
    const { error } = await supabase
      .from('chasen_knowledge')
      .upsert(entry, { onConflict: 'category,knowledge_key' })

    if (error) {
      console.error(`✗ Error upserting ${entry.knowledge_key}:`, error.message)
    } else {
      console.log(`✓ Upserted: ${entry.category}/${entry.knowledge_key}`)
      successCount++
    }
  }

  // Verify
  const { data, error: verifyError } = await supabase
    .from('chasen_knowledge')
    .select('category, knowledge_key, title, priority')
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (verifyError) {
    console.error('\n❌ Verification failed:', verifyError.message)
  } else {
    console.log(`\n✅ ChaSen Knowledge Base ready with ${data.length} entries:`)
    data.forEach(e => console.log(`  [${e.priority}] ${e.category}/${e.knowledge_key}: ${e.title}`))
  }
}

createKnowledgeTable()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
