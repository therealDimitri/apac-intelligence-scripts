import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf8')
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\n]+)/)?.[1]

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  serviceKey
)

async function main() {
  // Get ALL actions with any formatting issues
  const { data: all, error } = await supabase
    .from('actions')
    .select('Action_ID, Notes, client, Category, created_at')
    .or('Notes.ilike.%ASSIGNMENT INFO%,Notes.ilike.%----%,Notes.ilike.%Assigned by:%,Notes.ilike.%Assigned on:%,Notes.ilike.%Source:%')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Actions needing cleanup:', all?.length || 0)

  if (!all || all.length === 0) {
    console.log('All clean!')
    return
  }

  let updated = 0
  let failed = 0

  for (const action of all) {
    const category = action.Category || 'Priority Matrix'
    const created = new Date(action.created_at)
    const formattedDate = created.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const cleanNote = `Created from ${category} on ${formattedDate}.`

    const { error: updateError } = await supabase
      .from('actions')
      .update({ Notes: cleanNote, updated_at: new Date().toISOString() })
      .eq('Action_ID', action.Action_ID)

    if (updateError) {
      console.error(`Failed ${action.Action_ID}:`, updateError.message)
      failed++
    } else {
      console.log(`✓ ${action.Action_ID} (${action.client})`)
      updated++
    }
  }

  console.log(`\n✅ Updated: ${updated}, ❌ Failed: ${failed}`)
}

main()
