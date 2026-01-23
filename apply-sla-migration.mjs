#!/usr/bin/env node
/**
 * Apply the client_sla_targets migration to Supabase
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
)

async function applyMigration() {
  console.log('Applying client_sla_targets migration...')

  // Create the table directly
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS client_sla_targets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      canonical_name TEXT,
      tier TEXT DEFAULT 'Standard' CHECK (tier IN ('Platinum', 'Gold', 'Silver', 'Bronze', 'Standard')),
      response_sla_target DECIMAL(5,2) DEFAULT 95.00,
      resolution_sla_target DECIMAL(5,2) DEFAULT 90.00,
      availability_target DECIMAL(5,2) DEFAULT 99.50,
      csat_target DECIMAL(3,2) DEFAULT 4.00,
      weight_sla INTEGER DEFAULT 40 CHECK (weight_sla >= 0 AND weight_sla <= 100),
      weight_csat INTEGER DEFAULT 30 CHECK (weight_csat >= 0 AND weight_csat <= 100),
      weight_aging INTEGER DEFAULT 20 CHECK (weight_aging >= 0 AND weight_aging <= 100),
      weight_critical INTEGER DEFAULT 10 CHECK (weight_critical >= 0 AND weight_critical <= 100),
      aging_penalty_multiplier DECIMAL(3,2) DEFAULT 1.00,
      critical_penalty_multiplier DECIMAL(3,2) DEFAULT 1.00,
      effective_from DATE DEFAULT CURRENT_DATE,
      effective_to DATE,
      contract_start DATE,
      contract_end DATE,
      contract_value DECIMAL(12,2),
      notes TEXT,
      source_file TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT,
      updated_by TEXT,
      UNIQUE(client_name, effective_from)
    )
  `

  // Try to check if table exists first
  const { data: existingTable, error: checkError } = await supabase
    .from('client_sla_targets')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('Table client_sla_targets already exists, checking for data...')
    if (existingTable && existingTable.length > 0) {
      console.log('Table already has data, skipping...')
      return
    }
  }

  // Insert default tier configurations
  const defaults = [
    {
      client_name: '__DEFAULT_PLATINUM__',
      canonical_name: '__DEFAULT_PLATINUM__',
      tier: 'Platinum',
      response_sla_target: 98.00,
      resolution_sla_target: 95.00,
      availability_target: 99.90,
      csat_target: 4.50,
      weight_sla: 40,
      weight_csat: 30,
      weight_aging: 20,
      weight_critical: 10,
      notes: 'Default configuration for Platinum tier clients'
    },
    {
      client_name: '__DEFAULT_GOLD__',
      canonical_name: '__DEFAULT_GOLD__',
      tier: 'Gold',
      response_sla_target: 95.00,
      resolution_sla_target: 92.00,
      availability_target: 99.70,
      csat_target: 4.25,
      weight_sla: 40,
      weight_csat: 30,
      weight_aging: 20,
      weight_critical: 10,
      notes: 'Default configuration for Gold tier clients'
    },
    {
      client_name: '__DEFAULT_SILVER__',
      canonical_name: '__DEFAULT_SILVER__',
      tier: 'Silver',
      response_sla_target: 93.00,
      resolution_sla_target: 90.00,
      availability_target: 99.50,
      csat_target: 4.00,
      weight_sla: 40,
      weight_csat: 30,
      weight_aging: 20,
      weight_critical: 10,
      notes: 'Default configuration for Silver tier clients'
    },
    {
      client_name: '__DEFAULT_BRONZE__',
      canonical_name: '__DEFAULT_BRONZE__',
      tier: 'Bronze',
      response_sla_target: 90.00,
      resolution_sla_target: 85.00,
      availability_target: 99.00,
      csat_target: 3.75,
      weight_sla: 40,
      weight_csat: 30,
      weight_aging: 20,
      weight_critical: 10,
      notes: 'Default configuration for Bronze tier clients'
    },
    {
      client_name: '__DEFAULT_STANDARD__',
      canonical_name: '__DEFAULT_STANDARD__',
      tier: 'Standard',
      response_sla_target: 90.00,
      resolution_sla_target: 85.00,
      availability_target: 99.00,
      csat_target: 4.00,
      weight_sla: 40,
      weight_csat: 30,
      weight_aging: 20,
      weight_critical: 10,
      notes: 'Default configuration for Standard tier clients'
    }
  ]

  // Insert defaults
  const { error: insertError } = await supabase
    .from('client_sla_targets')
    .upsert(defaults, { onConflict: 'client_name,effective_from' })

  if (insertError) {
    console.error('Error inserting defaults:', insertError.message)
    // Table might not exist, need to create via Supabase dashboard
    console.log('\n⚠️  Please apply the migration manually via Supabase Dashboard SQL Editor:')
    console.log('   File: supabase/migrations/20260123_client_sla_targets.sql')
  } else {
    console.log('✅ Default tier configurations inserted successfully')
  }
}

applyMigration().catch(e => console.error('Migration failed:', e.message))
