import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  // Get a sample record to see the columns
  const { data, error } = await supabase
    .from('burc_attrition')
    .select('*')
    .limit(1)

  if (error) {
    console.log('Error:', error.message)
    return
  }

  if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]))
    console.log('Sample:', JSON.stringify(data[0], null, 2))
  } else {
    console.log('No data in table')
  }
}

check()
