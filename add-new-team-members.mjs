#!/usr/bin/env node

/**
 * Add new team members to cse_profiles table
 * These are the 9 new team members with their job titles
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
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const newTeamMembers = [
  {
    full_name: 'Carol-Lynne Lloyd',
    first_name: 'Carol-Lynne',
    email: 'carol-lynne.lloyd@alterahealth.com',
    role: 'Business Unit Chief Medical Officer',
    photo_url: '/placeholder-avatar.png',
  },
  {
    full_name: 'Cara Cortese',
    first_name: 'Cara',
    email: 'cara.cortese@alterahealth.com',
    role: 'Sr HR Business Partner',
    photo_url: '/placeholder-avatar.png',
  },
  {
    full_name: 'Tash Kowalczuk',
    first_name: 'Tash',
    email: 'tash.kowalczuk@alterahealth.com',
    role: 'Director Solutions Management',
    photo_url: '/placeholder-avatar.png',
  },
]

async function addTeamMembers() {
  console.log('🚀 Adding 9 new team members to cse_profiles...\n')

  for (const member of newTeamMembers) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('cse_profiles')
      .select('id, full_name, role')
      .eq('email', member.email)
      .single()

    if (existing) {
      console.log(`⏭️  ${member.full_name} already exists (${existing.role})`)
      continue
    }

    // Insert new member
    const { error } = await supabase.from('cse_profiles').insert(member)

    if (error) {
      console.error(`❌ Failed to add ${member.full_name}:`, error.message)
    } else {
      console.log(`✅ Added ${member.full_name} - ${member.role}`)
    }
  }

  console.log('\n✅ Done!')
}

addTeamMembers().catch(console.error)
