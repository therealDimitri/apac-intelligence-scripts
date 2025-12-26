#!/usr/bin/env node
/**
 * Fix Comment Author Avatars
 *
 * This script fixes comments that have broken author_avatar URLs.
 * The issue was that session.user.image from NextAuth returns MS Graph URLs
 * which require authentication and don't work as public image sources.
 *
 * This script:
 * 1. Fetches all comments with author_avatar set
 * 2. Looks up the correct photo URL from cse_profiles based on author email
 * 3. Updates the comments with the correct Supabase storage URL
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function fixCommentAvatars() {
  console.log('🔧 Fixing comment author avatars...\n')

  // Step 1: Fetch all CSE profiles with photos
  console.log('📥 Fetching CSE profiles...')
  const { data: profiles, error: profilesError } = await supabase
    .from('cse_profiles')
    .select('email, photo_url, full_name')
    .not('photo_url', 'is', null)

  if (profilesError) {
    console.error('❌ Failed to fetch CSE profiles:', profilesError.message)
    process.exit(1)
  }

  // Create email -> photo URL map
  const photoMap = new Map()
  for (const profile of profiles) {
    if (profile.email && profile.photo_url) {
      // Construct full Supabase storage URL
      const photoPath = profile.photo_url.startsWith('/')
        ? profile.photo_url.substring(1)
        : profile.photo_url
      const fullUrl = `${supabaseUrl}/storage/v1/object/public/cse-photos/${photoPath}`
      photoMap.set(profile.email.toLowerCase(), fullUrl)
      console.log(`  ✓ ${profile.full_name} (${profile.email})`)
    }
  }
  console.log(`\n📊 Found ${photoMap.size} CSE profiles with photos\n`)

  // Step 2: Fetch all comments with author_avatar
  console.log('📥 Fetching comments with avatars...')
  const { data: comments, error: commentsError } = await supabase
    .from('comments')
    .select('id, author_id, author_name, author_avatar')
    .not('author_avatar', 'is', null)

  if (commentsError) {
    console.error('❌ Failed to fetch comments:', commentsError.message)
    process.exit(1)
  }

  console.log(`📊 Found ${comments.length} comments with author_avatar set\n`)

  // Step 3: Check and fix each comment
  let fixed = 0
  let alreadyCorrect = 0
  let noMatch = 0

  for (const comment of comments) {
    const email = comment.author_id?.toLowerCase()
    const correctUrl = email ? photoMap.get(email) : null

    // Check if avatar is already a Supabase URL
    const isSupabaseUrl = comment.author_avatar?.includes('supabase.co/storage')

    if (isSupabaseUrl && comment.author_avatar === correctUrl) {
      alreadyCorrect++
      continue
    }

    if (correctUrl) {
      // Update with correct URL
      const { error: updateError } = await supabase
        .from('comments')
        .update({ author_avatar: correctUrl })
        .eq('id', comment.id)

      if (updateError) {
        console.error(`  ❌ Failed to update comment ${comment.id}:`, updateError.message)
      } else {
        console.log(`  ✓ Fixed: ${comment.author_name} (comment ${comment.id})`)
        fixed++
      }
    } else {
      // No matching CSE profile, set to null to show initials fallback
      const { error: updateError } = await supabase
        .from('comments')
        .update({ author_avatar: null })
        .eq('id', comment.id)

      if (updateError) {
        console.error(`  ❌ Failed to clear avatar for comment ${comment.id}:`, updateError.message)
      } else {
        console.log(`  ⚠ No CSE photo found for ${comment.author_name} - cleared avatar (will show initials)`)
        noMatch++
      }
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Summary:')
  console.log(`   ✓ Fixed: ${fixed}`)
  console.log(`   ✓ Already correct: ${alreadyCorrect}`)
  console.log(`   ⚠ No CSE photo (cleared): ${noMatch}`)
  console.log('='.repeat(50))
  console.log('\n✅ Done!')
}

fixCommentAvatars().catch(err => {
  console.error('❌ Script failed:', err)
  process.exit(1)
})
