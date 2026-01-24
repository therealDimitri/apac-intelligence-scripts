import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface NPSResponse {
  client_name: string
  contact_name: string | null
  score: number
  category: string
  feedback: string | null
  response_date: string | null
  period: string
  created_at: string
  business_unit: string | null
  role: string | null
  cse_name: string | null
  contact_email: string | null
  region: string | null
}

async function importNPS() {
  const filePath =
    '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/NPS/2025 NPS Q4/Surveys/Responses/APAC/Final Data Files/APAC_NPS_Q4_2025_ with Analysis.xlsx'

  console.log('Reading NPS Q4 2025 data...')
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets['All_Responses']
  const data = XLSX.utils.sheet_to_json(sheet) as Array<{
    'Parent Account Name': string
    'CSE/CE name': string
    Region: string
    'Primary BU': string
    NPS_Score: number
    Segment: string
    Primary_Theme: string
    All_Themes: string
    Theme_Count: number
    Comments: string
  }>

  console.log(`Found ${data.length} responses to import`)

  // Map to nps_responses schema
  const responses: NPSResponse[] = data.map(row => ({
    client_name: row['Parent Account Name'],
    contact_name: null, // Not available in this export
    score: row.NPS_Score,
    category: row.Segment,
    feedback: row.Comments || null,
    response_date: '2025-10-15', // Q4 2025 survey period
    period: 'Q4 25',
    created_at: new Date().toISOString(),
    business_unit: row['Primary BU'],
    role: null,
    cse_name: row['CSE/CE name'],
    contact_email: null,
    region: row.Region,
  }))

  // Check for existing Q4 25 data to avoid duplicates
  const { count: existingCount } = await supabase
    .from('nps_responses')
    .select('*', { count: 'exact', head: true })
    .eq('period', 'Q4 25')

  if (existingCount && existingCount > 0) {
    console.log(`Warning: ${existingCount} Q4 25 responses already exist.`)
    console.log('Skipping import to avoid duplicates.')
    console.log('Delete existing Q4 25 data first if you want to reimport.')
    return
  }

  // Get client UUIDs for linking
  const { data: clients } = await supabase.from('clients').select('uuid, canonical_name')

  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')
    .eq('is_active', true)

  // Build lookup map
  const clientLookup = new Map<string, string>()
  clients?.forEach(c => {
    if (c.canonical_name) {
      clientLookup.set(c.canonical_name.toLowerCase(), c.uuid)
    }
  })
  aliases?.forEach(a => {
    if (a.display_name && a.canonical_name) {
      const uuid = clientLookup.get(a.canonical_name.toLowerCase())
      if (uuid) {
        clientLookup.set(a.display_name.toLowerCase(), uuid)
      }
    }
  })

  // Add client_uuid to responses
  const responsesWithUuid = responses.map(r => ({
    ...r,
    client_uuid: clientLookup.get(r.client_name.toLowerCase()) || null,
  }))

  // Insert in batches
  const batchSize = 50
  let inserted = 0
  let failed = 0

  for (let i = 0; i < responsesWithUuid.length; i += batchSize) {
    const batch = responsesWithUuid.slice(i, i + batchSize)
    const { data: result, error } = await supabase.from('nps_responses').insert(batch).select('id')

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message)
      failed += batch.length
    } else {
      inserted += result?.length || 0
    }
  }

  console.log(`\nImport complete:`)
  console.log(`  - Inserted: ${inserted} responses`)
  console.log(`  - Failed: ${failed} responses`)
  console.log(
    `  - With client_uuid: ${responsesWithUuid.filter(r => r.client_uuid).length} responses`
  )
  console.log(
    `  - Without client_uuid: ${responsesWithUuid.filter(r => !r.client_uuid).length} responses`
  )

  // List clients without UUID match
  const unmatchedClients = [
    ...new Set(responsesWithUuid.filter(r => !r.client_uuid).map(r => r.client_name)),
  ]
  if (unmatchedClients.length > 0) {
    console.log(`\nClients without UUID match (may need aliases):`)
    unmatchedClients.forEach(c => console.log(`  - ${c}`))
  }
}

importNPS().catch(console.error)
