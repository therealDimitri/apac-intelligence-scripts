import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Use the direct connection URL
const DATABASE_URL = process.env.DATABASE_URL_DIRECT ||
  'postgresql://postgres:***REMOVED***@db.usoyxsunetvxdjdglkmn.supabase.co:5432/postgres'

async function createTable() {
  const client = new pg.Client({ connectionString: DATABASE_URL })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected!\n')

    // Read migration SQL
    const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20251218_cse_client_assignments.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log('Executing migration...\n')
    await client.query(sql)

    console.log('✅ Migration complete!\n')

    // Verify the data
    const result = await client.query(`
      SELECT cse_name, COUNT(*) as client_count
      FROM cse_client_assignments
      GROUP BY cse_name
      ORDER BY client_count DESC
    `)

    console.log('=== CSE Assignments Created ===')
    result.rows.forEach(row => {
      console.log(`  ${row.cse_name}: ${row.client_count} clients`)
    })

    const total = await client.query('SELECT COUNT(*) FROM cse_client_assignments')
    console.log(`\nTotal assignments: ${total.rows[0].count}`)

  } catch (error) {
    console.error('❌ Error:', error.message)

    // If table already exists, just show current state
    if (error.message.includes('already exists')) {
      console.log('\nTable already exists. Checking current data...')
      try {
        const result = await client.query(`
          SELECT cse_name, client_name_normalized
          FROM cse_client_assignments
          ORDER BY cse_name, client_name_normalized
        `)
        console.log('\nCurrent assignments:')
        result.rows.forEach(r => console.log(`  ${r.cse_name} -> ${r.client_name_normalized}`))
      } catch (e) {
        console.error('Could not query table:', e.message)
      }
    }
  } finally {
    await client.end()
  }
}

createTable()
