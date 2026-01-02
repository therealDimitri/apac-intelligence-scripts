#!/usr/bin/env node

/**
 * Add Deal/Renewal Prep (Internal) Activity Type
 *
 * Run with: node scripts/add-deal-renewal-activity-type.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addActivityType() {
  console.log('🔄 Adding Deal/Renewal Prep (Internal) activity type...\n')

  try {
    // First check if it already exists
    const { data: existing, error: checkError } = await supabase
      .from('activity_types')
      .select('*')
      .eq('code', 'DEAL_RENEWAL_PREP')
      .single()

    if (existing) {
      console.log('✅ Activity type already exists:', existing)
      return
    }

    // Get the max sort_order
    const { data: maxOrder } = await supabase
      .from('activity_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (maxOrder?.sort_order || 0) + 1

    // Insert the new activity type
    const { data, error } = await supabase
      .from('activity_types')
      .insert({
        code: 'DEAL_RENEWAL_PREP',
        name: 'Deal/Renewal Prep',
        description: 'Preparation activities for deals and renewals',
        category: 'internal_ops',
        shows_on_client_profile: false,
        color: 'amber',
        sort_order: nextOrder,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Failed to insert activity type:', error.message)
      return
    }

    console.log('✅ Successfully added activity type:', data)
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

// Run
addActivityType()
