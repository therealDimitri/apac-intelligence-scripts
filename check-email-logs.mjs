/**
 * Check email logs to verify scheduled emails were sent
 * Run: node scripts/check-email-logs.mjs [type] [days]
 *
 * Examples:
 *   node scripts/check-email-logs.mjs                # Check all emails from today
 *   node scripts/check-email-logs.mjs wednesday      # Check Wednesday emails from today
 *   node scripts/check-email-logs.mjs monday 7       # Check Monday emails from last 7 days
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
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkEmailLogs() {
  const args = process.argv.slice(2)
  const emailType = args[0] || null // 'monday', 'wednesday', 'friday', or null for all
  const daysBack = parseInt(args[1]) || 0 // 0 = today only

  const now = new Date()
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - daysBack)
  startDate.setHours(0, 0, 0, 0)

  console.log('='.repeat(60))
  console.log('Email Logs Check')
  console.log('='.repeat(60))
  console.log(`Date: ${now.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  console.log(`Filter: ${emailType || 'All types'}`)
  console.log(`Period: ${daysBack === 0 ? 'Today' : `Last ${daysBack} days`}`)
  console.log('='.repeat(60))
  console.log()

  // Build query
  let query = supabase
    .from('email_logs')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })

  if (emailType) {
    query = query.eq('email_type', emailType)
  }

  const { data: logs, error } = await query

  if (error) {
    if (error.code === '42P01') {
      console.log('email_logs table does not exist yet.')
      console.log('\nTo create it:')
      console.log('1. Open the Supabase SQL Editor')
      console.log('2. Run: docs/migrations/20251224_email_logs_table.sql')
      return
    }
    console.error('Error fetching logs:', error.message)
    return
  }

  if (!logs || logs.length === 0) {
    console.log('No email logs found for the specified period.')
    console.log()

    // Check what day of the week it is
    const dayOfWeek = now.getDay()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    console.log(`Today is ${dayNames[dayOfWeek]}.`)

    if (dayOfWeek === 1) {
      console.log('Monday emails should have been sent at 6:00 AM Sydney time (7:00 PM UTC Sunday).')
    } else if (dayOfWeek === 3) {
      console.log('Wednesday emails should have been sent at 12:00 PM Sydney time (1:00 AM UTC).')
    } else if (dayOfWeek === 5) {
      console.log('Friday emails should have been sent at 3:00 PM Sydney time (4:00 AM UTC).')
    }
    return
  }

  // Group logs by email type
  const grouped = {}
  for (const log of logs) {
    if (!grouped[log.email_type]) {
      grouped[log.email_type] = []
    }
    grouped[log.email_type].push(log)
  }

  // Display results
  for (const [type, typeLogs] of Object.entries(grouped)) {
    const sent = typeLogs.filter(l => l.status === 'sent').length
    const failed = typeLogs.filter(l => l.status === 'failed').length

    console.log(`${type.toUpperCase()} EMAILS`)
    console.log('-'.repeat(40))
    console.log(`Total: ${typeLogs.length} | Sent: ${sent} | Failed: ${failed}`)
    console.log()

    for (const log of typeLogs) {
      const statusIcon = log.status === 'sent' ? '✅' : log.status === 'failed' ? '❌' : '⏳'
      const time = new Date(log.created_at).toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Australia/Sydney'
      })
      console.log(`  ${statusIcon} ${log.recipient_name}`)
      console.log(`     Email: ${log.recipient_email}`)
      console.log(`     Time: ${time} AEDT`)
      if (log.error_message) {
        console.log(`     Error: ${log.error_message}`)
      }
      console.log()
    }
  }

  // Summary
  const totalSent = logs.filter(l => l.status === 'sent').length
  const totalFailed = logs.filter(l => l.status === 'failed').length

  console.log('='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total emails logged: ${logs.length}`)
  console.log(`Successfully sent: ${totalSent}`)
  console.log(`Failed: ${totalFailed}`)

  if (totalFailed > 0) {
    console.log()
    console.log('Failed emails:')
    logs.filter(l => l.status === 'failed').forEach(l => {
      console.log(`  - ${l.recipient_name}: ${l.error_message || 'Unknown error'}`)
    })
  }
}

checkEmailLogs()
