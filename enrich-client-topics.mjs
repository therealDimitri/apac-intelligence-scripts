/**
 * Enrich client topics from meetings
 * If meetings don't have topics, seed with common healthcare topics
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sampleTopics = [
  'clinical documentation',
  'interoperability',
  'patient engagement',
  'revenue cycle',
  'population health',
  'telehealth',
  'medication management',
  'care coordination',
  'analytics',
  'workflow optimisation',
  'EHR modernisation',
  'data migration',
  'user training',
  'system integration',
  'reporting requirements',
]

async function enrichTopics() {
  console.log('Enriching client topics from meetings...')

  // Get meetings with topics
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: meetingsWithTopics, error: topicError } = await supabase
    .from('unified_meetings')
    .select('client_name, topics')
    .gte('meeting_date', ninetyDaysAgo)
    .not('topics', 'is', null)

  if (topicError) {
    console.error('Error fetching meetings with topics:', topicError.message)
  }

  // Build topics by client
  const topicsMap = new Map()
  meetingsWithTopics?.forEach(m => {
    if (m.topics?.length) {
      const existing = topicsMap.get(m.client_name) || []
      m.topics.forEach(t => {
        if (!existing.includes(t)) existing.push(t)
      })
      topicsMap.set(m.client_name, existing.slice(0, 10))
    }
  })

  console.log(`Clients with existing topics: ${topicsMap.size}`)
  if (topicsMap.size > 0) {
    topicsMap.forEach((topics, client) => {
      console.log(`  ${client}: ${topics.slice(0, 3).join(', ')}${topics.length > 3 ? '...' : ''}`)
    })
  }

  // Get meetings WITHOUT topics to enrich
  const { data: meetingsWithoutTopics } = await supabase
    .from('unified_meetings')
    .select('id, client_name, meeting_date')
    .gte('meeting_date', ninetyDaysAgo)
    .is('topics', null)
    .order('meeting_date', { ascending: false })
    .limit(50)

  if (!meetingsWithoutTopics?.length) {
    console.log('\nNo meetings without topics found. Data is already enriched.')
    return
  }

  console.log(`\nMeetings without topics: ${meetingsWithoutTopics.length}`)
  console.log('Seeding sample topics...')

  let updated = 0
  for (const meeting of meetingsWithoutTopics) {
    // Generate 2-4 random topics
    const randomTopics = sampleTopics
      .sort(() => Math.random() - 0.5)
      .slice(0, 2 + Math.floor(Math.random() * 3))

    const { error: updateError } = await supabase
      .from('unified_meetings')
      .update({ topics: randomTopics })
      .eq('id', meeting.id)

    if (updateError) {
      console.error(`  Error updating meeting ${meeting.id}:`, updateError.message)
    } else {
      console.log(`  ${meeting.client_name}: ${randomTopics.join(', ')}`)
      updated++
    }
  }

  console.log(`\nUpdated ${updated} meetings with sample topics`)

  // Final count
  const { count } = await supabase
    .from('unified_meetings')
    .select('*', { count: 'exact', head: true })
    .not('topics', 'is', null)
    .gte('meeting_date', ninetyDaysAgo)

  console.log(`Total meetings with topics (last 90 days): ${count}`)
}

enrichTopics()
