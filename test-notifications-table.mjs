#!/usr/bin/env node

/**
 * Test that the notifications table exists and is accessible
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testNotificationsTable() {
  console.log('Testing notifications table...')
  console.log('')

  // Test 1: Check table exists
  console.log('1. Checking table exists...')
  const { data: checkData, error: checkError } = await supabase
    .from('notifications')
    .select('id')
    .limit(1)

  if (checkError) {
    console.error('   ERROR:', checkError.message)
    console.error('   Code:', checkError.code)
    return false
  }
  console.log('   Table exists!')

  // Test 2: Insert a test notification
  console.log('2. Inserting test notification...')
  const { data: insertData, error: insertError } = await supabase
    .from('notifications')
    .insert({
      user_id: 'test-user',
      user_email: 'test@example.com',
      type: 'mention',
      title: 'Test notification',
      message: 'This is a test notification',
      triggered_by: 'System Test'
    })
    .select()
    .single()

  if (insertError) {
    console.error('   INSERT ERROR:', insertError.message)
    return false
  }
  console.log('   Insert successful! ID:', insertData.id)

  // Test 3: Read the notification
  console.log('3. Reading notification...')
  const { data: readData, error: readError } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', insertData.id)
    .single()

  if (readError) {
    console.error('   READ ERROR:', readError.message)
    return false
  }
  console.log('   Read successful!')
  console.log('   Data:', JSON.stringify(readData, null, 2))

  // Test 4: Delete the test notification
  console.log('4. Cleaning up test notification...')
  const { error: deleteError } = await supabase
    .from('notifications')
    .delete()
    .eq('id', insertData.id)

  if (deleteError) {
    console.error('   DELETE ERROR:', deleteError.message)
    return false
  }
  console.log('   Cleanup successful!')

  console.log('')
  console.log('All tests passed! Notifications table is fully functional.')
  return true
}

testNotificationsTable()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
