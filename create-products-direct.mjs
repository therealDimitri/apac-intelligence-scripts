import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const { Client } = pg

async function createTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('Connected to database')

    // Create products table
    console.log('\nCreating products table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    console.log('  ✓ Products table created')

    // Create client_products table
    console.log('Creating client_products table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        client_name TEXT NOT NULL,
        product_code TEXT NOT NULL,
        implementation_date DATE,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(client_name, product_code)
      )
    `)
    console.log('  ✓ Client products table created')

    // Enable RLS
    console.log('Enabling RLS...')
    await client.query('ALTER TABLE products ENABLE ROW LEVEL SECURITY')
    await client.query('ALTER TABLE client_products ENABLE ROW LEVEL SECURITY')

    // Drop existing policies first to avoid conflicts
    await client.query('DROP POLICY IF EXISTS "Allow read access" ON products')
    await client.query('DROP POLICY IF EXISTS "Allow read access" ON client_products')

    // Create read policies
    await client.query('CREATE POLICY "Allow read access" ON products FOR SELECT USING (true)')
    await client.query('CREATE POLICY "Allow read access" ON client_products FOR SELECT USING (true)')
    console.log('  ✓ RLS policies created')

    // Insert products
    console.log('\nInserting products...')
    const products = [
      { code: 'medsuite', name: 'MedSuite Enterprise', category: 'Clinical', description: 'Comprehensive clinical information system for hospitals', icon: 'heart-pulse' },
      { code: 'labconnect', name: 'LabConnect Pro', category: 'Laboratory', description: 'Laboratory information and workflow management system', icon: 'flask' },
      { code: 'patient-portal', name: 'PatientPortal', category: 'Engagement', description: 'Patient engagement and self-service portal', icon: 'users' },
      { code: 'analytics', name: 'Analytics Plus', category: 'Analytics', description: 'Business intelligence and reporting platform', icon: 'bar-chart' },
      { code: 'mobile', name: 'Mobile Health', category: 'Mobile', description: 'Mobile applications for clinicians and patients', icon: 'smartphone' },
      { code: 'radiology', name: 'RadConnect', category: 'Imaging', description: 'Radiology information and PACS integration', icon: 'scan' },
      { code: 'pharmacy', name: 'PharmaSuite', category: 'Pharmacy', description: 'Pharmacy management and medication tracking', icon: 'pill' },
    ]

    for (const p of products) {
      await client.query(`
        INSERT INTO products (code, name, category, description, icon)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          icon = EXCLUDED.icon,
          updated_at = now()
      `, [p.code, p.name, p.category, p.description, p.icon])
      console.log(`  ✓ ${p.name}`)
    }

    // Insert client products
    console.log('\nInserting client products...')
    const clientProducts = [
      // SA Health
      ['Minister for Health aka South Australia Health', 'medsuite'],
      ['Minister for Health aka South Australia Health', 'labconnect'],
      ['Minister for Health aka South Australia Health', 'patient-portal'],
      ['Minister for Health aka South Australia Health', 'analytics'],
      ['Minister for Health aka South Australia Health', 'radiology'],
      ['Minister for Health aka South Australia Health', 'pharmacy'],
      // SingHealth
      ['Singapore Health Services Pte Ltd', 'medsuite'],
      ['Singapore Health Services Pte Ltd', 'labconnect'],
      ['Singapore Health Services Pte Ltd', 'analytics'],
      ['Singapore Health Services Pte Ltd', 'mobile'],
      // Grampians
      ['Grampians Health Alliance', 'medsuite'],
      ['Grampians Health Alliance', 'patient-portal'],
      ['Grampians Health Alliance', 'analytics'],
      // WA Health
      ['Western Australia Department Of Health', 'medsuite'],
      ['Western Australia Department Of Health', 'labconnect'],
      ['Western Australia Department Of Health', 'radiology'],
      // St Luke's
      ["St Luke's Medical Center Global City Inc", 'medsuite'],
      ["St Luke's Medical Center Global City Inc", 'patient-portal'],
      ["St Luke's Medical Center Global City Inc", 'pharmacy'],
      // GRMC
      ['GRMC (Guam Regional Medical Centre)', 'medsuite'],
      ['GRMC (Guam Regional Medical Centre)', 'labconnect'],
      // Epworth
      ['Epworth Healthcare', 'medsuite'],
      ['Epworth Healthcare', 'patient-portal'],
      ['Epworth Healthcare', 'analytics'],
      // Waikato
      ['Te Whatu Ora Waikato', 'medsuite'],
      ['Te Whatu Ora Waikato', 'labconnect'],
      // Barwon
      ['Barwon Health Australia', 'medsuite'],
      ['Barwon Health Australia', 'analytics'],
      // Western Health
      ['Western Health', 'medsuite'],
      ['Western Health', 'patient-portal'],
      // RVEEH
      ['The Royal Victorian Eye and Ear Hospital', 'medsuite'],
      // GHA Regional
      ['Gippsland Health Alliance', 'medsuite'],
      ['Gippsland Health Alliance', 'analytics'],
      // MINDEF
      ['Ministry of Defence, Singapore', 'medsuite'],
      ['Ministry of Defence, Singapore', 'mobile'],
      // Mount Alvernia
      ['Mount Alvernia Hospital', 'medsuite'],
      ['Mount Alvernia Hospital', 'patient-portal'],
      // Albury Wodonga
      ['Albury Wodonga Health', 'medsuite'],
      // DoH Victoria
      ['Department of Health - Victoria', 'medsuite'],
      ['Department of Health - Victoria', 'analytics'],
      // Northern Health
      ['Northern Health', 'medsuite'],
      ['Northern Health', 'patient-portal'],
      // Austin Health
      ['Austin Health', 'medsuite'],
      ['Austin Health', 'labconnect'],
      ['Austin Health', 'analytics'],
      // Mercy
      ['Mercy Aged Care', 'medsuite'],
    ]

    let inserted = 0
    for (const [clientName, productCode] of clientProducts) {
      try {
        await client.query(`
          INSERT INTO client_products (client_name, product_code, status)
          VALUES ($1, $2, 'active')
          ON CONFLICT (client_name, product_code) DO UPDATE SET
            status = 'active',
            updated_at = now()
        `, [clientName, productCode])
        inserted++
      } catch (err) {
        console.log(`  ❌ ${clientName} - ${productCode}: ${err.message}`)
      }
    }
    console.log(`  ✓ Inserted ${inserted} client-product mappings`)

    console.log('\n=== Migration Complete ===')
  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

createTables()
