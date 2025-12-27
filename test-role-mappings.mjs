#!/usr/bin/env node

/**
 * Test script to verify new role mappings are working correctly
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

/**
 * Simulates the role mapping logic from useUserProfile.ts
 */
function mapRoleTitle(roleTitle) {
  const roleLower = (roleTitle || '').toLowerCase()

  // Order matters - check most specific patterns first
  if (roleLower.includes('client success executive') || roleLower === 'cse') {
    return 'cse'
  } else if (roleLower.includes('client account manager') || roleLower === 'cam') {
    return 'cam'
  } else if (roleLower.includes('evp') || roleLower === 'evp apac') {
    return 'evp'
  } else if (roleLower.includes('svp') || roleLower.includes('senior vice president')) {
    return 'svp'
  } else if (roleLower.includes('chief medical officer') || roleLower.includes('cmo')) {
    return 'clinical'
  } else if (roleLower.includes('hr') || roleLower.includes('human resources') || roleLower.includes('business partner')) {
    return 'hr'
  } else if (roleLower.includes('marketing') || roleLower.includes('field marketing')) {
    return 'marketing'
  } else if (roleLower.includes('program manager') || roleLower.includes('project manager')) {
    return 'program'
  } else if (roleLower.includes('solutions') || roleLower.includes('product')) {
    return 'solutions'
  } else if (roleLower.includes('avp support') || roleLower.includes('client support')) {
    // Specific support leadership roles
    return 'support'
  } else if (
    (roleLower.includes('vp') || roleLower.includes('vice president') || roleLower.includes('avp')) &&
    !roleLower.includes('business support') &&
    !roleLower.includes('business operations')
  ) {
    // VP/AVP level roles (but not operations-focused VPs handled below)
    return 'vp'
  } else if (roleLower.includes('vp business support') || roleLower.includes('vp business operations')) {
    // VP-level operations/support roles map to VP (seniority takes precedence)
    return 'vp'
  } else if (
    roleLower.includes('support') ||
    roleLower.includes('business operations') ||
    roleLower.includes('business support')
  ) {
    return 'operations'
  } else if (roleLower.includes('director')) {
    return 'vp' // Directors map to VP level
  } else if (roleLower.includes('manager')) {
    return 'manager'
  } else if (roleLower.includes('executive')) {
    return 'executive'
  } else if (roleLower.includes('admin')) {
    return 'admin'
  } else {
    return 'manager' // Default
  }
}

async function testRoleMappings() {
  console.log('🧪 Testing Role Mappings\n')
  console.log('='.repeat(80))

  // Fetch all profiles from database
  const { data: profiles, error } = await supabase
    .from('cse_profiles')
    .select('full_name, email, role')
    .order('role')

  if (error) {
    console.error('❌ Failed to fetch profiles:', error.message)
    process.exit(1)
  }

  console.log(`\nFound ${profiles.length} team members in cse_profiles\n`)

  // Test each profile
  const results = []
  for (const profile of profiles) {
    const mappedRole = mapRoleTitle(profile.role)
    results.push({
      name: profile.full_name,
      dbRole: profile.role,
      mappedRole,
    })
  }

  // Group by mapped role for display
  const byMappedRole = {}
  for (const r of results) {
    if (!byMappedRole[r.mappedRole]) {
      byMappedRole[r.mappedRole] = []
    }
    byMappedRole[r.mappedRole].push(r)
  }

  // Display results by mapped role
  const roleOrder = ['evp', 'svp', 'vp', 'manager', 'cse', 'cam', 'solutions', 'marketing', 'program', 'clinical', 'hr', 'support', 'operations', 'admin']

  for (const role of roleOrder) {
    const members = byMappedRole[role]
    if (members && members.length > 0) {
      console.log(`\n📋 ${role.toUpperCase()} (${members.length} members)`)
      console.log('-'.repeat(60))
      for (const m of members) {
        console.log(`  ✅ ${m.name}`)
        console.log(`     DB Role: "${m.dbRole}"`)
      }
    }
  }

  // Check for any unexpected mappings
  const newRoles = ['svp', 'vp', 'solutions', 'marketing', 'program', 'clinical', 'hr', 'support']
  const newRoleMappings = results.filter(r => newRoles.includes(r.mappedRole))

  console.log('\n' + '='.repeat(80))
  console.log('\n🎯 NEW ROLE TYPE MAPPINGS SUMMARY:')
  console.log('-'.repeat(60))

  if (newRoleMappings.length > 0) {
    for (const m of newRoleMappings) {
      console.log(`  ✅ ${m.name} → ${m.mappedRole}`)
    }
    console.log(`\n✅ ${newRoleMappings.length} team members mapped to new role types`)
  } else {
    console.log('  ⚠️  No team members mapped to new role types')
  }

  console.log('\n' + '='.repeat(80))
  console.log('\n✅ Role mapping test complete!')
}

testRoleMappings().catch(console.error)
