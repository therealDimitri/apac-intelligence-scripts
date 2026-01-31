#!/usr/bin/env node
/**
 * Sales Hub Migration
 * Creates tables for product catalog, solution bundles, value wedges, and toolkits
 *
 * Run from project root: node scripts/apply-sales-hub-migration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SQL = `
-- =====================================================
-- Sales Hub Tables Migration
-- =====================================================

-- Product Catalog: Individual products (sales briefs, datasheets, etc.)
CREATE TABLE IF NOT EXISTS product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  product_family TEXT NOT NULL,
  product_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  regions TEXT[] DEFAULT '{}',

  -- Content
  title TEXT NOT NULL,
  elevator_pitch TEXT,
  solution_overview TEXT,
  value_propositions JSONB DEFAULT '[]',
  key_drivers JSONB DEFAULT '[]',
  target_triggers TEXT[] DEFAULT '{}',

  -- Sales Support
  competitive_analysis JSONB DEFAULT '[]',
  objection_handling JSONB DEFAULT '[]',
  qualification_questions TEXT[] DEFAULT '{}',
  discovery_questions TEXT[] DEFAULT '{}',
  faq JSONB DEFAULT '[]',

  -- Commercial
  pricing_summary TEXT,
  pricing_details JSONB,
  version_requirements TEXT,

  -- Resources
  asset_url TEXT NOT NULL,
  asset_filename TEXT,
  support_tools TEXT[] DEFAULT '{}',
  sme_contacts JSONB DEFAULT '[]',

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Solution Bundles: Combined offerings with persona messaging (from toolkits)
CREATE TABLE IF NOT EXISTS solution_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  bundle_name TEXT NOT NULL,
  tagline TEXT,
  product_ids UUID[] DEFAULT '{}',

  -- "What it is/does/means" framework
  what_it_is TEXT,
  what_it_does TEXT,
  what_it_means JSONB DEFAULT '{}',

  -- Success metrics
  kpis JSONB DEFAULT '[]',
  market_drivers TEXT[] DEFAULT '{}',

  -- Persona-specific messaging
  persona_notes JSONB DEFAULT '{}',

  -- Grabber examples
  grabber_examples TEXT[] DEFAULT '{}',

  -- Metadata
  regions TEXT[] DEFAULT '{}',
  asset_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Value Wedges: Detailed value propositions linked to products
CREATE TABLE IF NOT EXISTS value_wedges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_catalog_id UUID REFERENCES product_catalog(id) ON DELETE CASCADE,

  -- Three-tier value hierarchy
  unique_how TEXT[] DEFAULT '{}',
  important_wow TEXT[] DEFAULT '{}',
  defensible_proof TEXT[] DEFAULT '{}',

  -- Additional content
  target_personas TEXT[] DEFAULT '{}',
  competitive_positioning TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Toolkits: Parent documents linking multiple bundles
CREATE TABLE IF NOT EXISTS toolkits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  description TEXT,
  version TEXT,

  -- Linked content
  bundle_ids UUID[] DEFAULT '{}',

  -- Metadata
  regions TEXT[] DEFAULT '{}',
  asset_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_product_catalog_family ON product_catalog(product_family);
CREATE INDEX IF NOT EXISTS idx_product_catalog_content_type ON product_catalog(content_type);
CREATE INDEX IF NOT EXISTS idx_product_catalog_active ON product_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_product_catalog_regions ON product_catalog USING GIN(regions);

CREATE INDEX IF NOT EXISTS idx_solution_bundles_active ON solution_bundles(is_active);
CREATE INDEX IF NOT EXISTS idx_solution_bundles_regions ON solution_bundles USING GIN(regions);

CREATE INDEX IF NOT EXISTS idx_value_wedges_product ON value_wedges(product_catalog_id);

CREATE INDEX IF NOT EXISTS idx_toolkits_active ON toolkits(is_active);

-- Enable RLS
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE solution_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE value_wedges ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolkits ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to read all
CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON product_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON solution_bundles FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON value_wedges FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON toolkits FOR SELECT TO authenticated USING (true);

-- RLS Policies: Allow service role full access
CREATE POLICY IF NOT EXISTS "Allow service role all" ON product_catalog FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "Allow service role all" ON solution_bundles FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "Allow service role all" ON value_wedges FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "Allow service role all" ON toolkits FOR ALL TO service_role USING (true);
`

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('id')
    .limit(1)

  // If no error, table exists
  return !error
}

async function main() {
  console.log('🚀 Sales Hub Migration\n')

  // Check if tables already exist
  const productExists = await checkTableExists('product_catalog')
  const bundlesExists = await checkTableExists('solution_bundles')
  const wedgesExists = await checkTableExists('value_wedges')
  const toolkitsExists = await checkTableExists('toolkits')

  if (productExists && bundlesExists && wedgesExists && toolkitsExists) {
    console.log('✅ All Sales Hub tables already exist!')
    return
  }

  console.log('📊 Table status:')
  console.log(`   product_catalog:  ${productExists ? '✅ exists' : '❌ missing'}`)
  console.log(`   solution_bundles: ${bundlesExists ? '✅ exists' : '❌ missing'}`)
  console.log(`   value_wedges:     ${wedgesExists ? '✅ exists' : '❌ missing'}`)
  console.log(`   toolkits:         ${toolkitsExists ? '✅ exists' : '❌ missing'}`)

  // Try direct connection
  const DATABASE_URL = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
  if (DATABASE_URL) {
    console.log('\n🔄 Attempting direct database connection...')
    try {
      const { default: pg } = await import('pg')
      const client = new pg.Client({ connectionString: DATABASE_URL })
      await client.connect()
      await client.query(SQL)
      await client.end()
      console.log('✅ Migration applied successfully!')

      // Verify
      const verified = await checkTableExists('product_catalog')
      if (verified) {
        console.log('✅ Verified: Tables are now accessible!')
      }
      return
    } catch (pgError) {
      console.log('⚠️  Direct connection failed:', pgError.message)
    }
  }

  // Fallback: Output SQL for manual execution
  console.log('\n📋 Please run the following SQL in Supabase SQL Editor:')
  console.log('─'.repeat(70))
  console.log(SQL)
  console.log('─'.repeat(70))
  console.log('\n🔗 Open: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
}

main().catch(console.error)
