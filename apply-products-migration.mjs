import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Products data
const PRODUCTS = [
  { code: 'medsuite', name: 'MedSuite Enterprise', category: 'Clinical', description: 'Comprehensive clinical information system for hospitals', icon: 'heart-pulse' },
  { code: 'labconnect', name: 'LabConnect Pro', category: 'Laboratory', description: 'Laboratory information and workflow management system', icon: 'flask' },
  { code: 'patient-portal', name: 'PatientPortal', category: 'Engagement', description: 'Patient engagement and self-service portal', icon: 'users' },
  { code: 'analytics', name: 'Analytics Plus', category: 'Analytics', description: 'Business intelligence and reporting platform', icon: 'bar-chart' },
  { code: 'mobile', name: 'Mobile Health', category: 'Mobile', description: 'Mobile applications for clinicians and patients', icon: 'smartphone' },
  { code: 'radiology', name: 'RadConnect', category: 'Imaging', description: 'Radiology information and PACS integration', icon: 'scan' },
  { code: 'pharmacy', name: 'PharmaSuite', category: 'Pharmacy', description: 'Pharmacy management and medication tracking', icon: 'pill' },
]

// Client-product mappings
const CLIENT_PRODUCTS = [
  // SA Health - full suite
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'medsuite' },
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'labconnect' },
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'patient-portal' },
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'analytics' },
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'radiology' },
  { client_name: 'Minister for Health aka South Australia Health', product_code: 'pharmacy' },
  // SingHealth
  { client_name: 'Singapore Health Services Pte Ltd', product_code: 'medsuite' },
  { client_name: 'Singapore Health Services Pte Ltd', product_code: 'labconnect' },
  { client_name: 'Singapore Health Services Pte Ltd', product_code: 'analytics' },
  { client_name: 'Singapore Health Services Pte Ltd', product_code: 'mobile' },
  // Grampians
  { client_name: 'Grampians Health Alliance', product_code: 'medsuite' },
  { client_name: 'Grampians Health Alliance', product_code: 'patient-portal' },
  { client_name: 'Grampians Health Alliance', product_code: 'analytics' },
  // WA Health
  { client_name: 'Western Australia Department Of Health', product_code: 'medsuite' },
  { client_name: 'Western Australia Department Of Health', product_code: 'labconnect' },
  { client_name: 'Western Australia Department Of Health', product_code: 'radiology' },
  // St Luke's
  { client_name: "St Luke's Medical Center Global City Inc", product_code: 'medsuite' },
  { client_name: "St Luke's Medical Center Global City Inc", product_code: 'patient-portal' },
  { client_name: "St Luke's Medical Center Global City Inc", product_code: 'pharmacy' },
  // GRMC
  { client_name: 'GRMC (Guam Regional Medical Centre)', product_code: 'medsuite' },
  { client_name: 'GRMC (Guam Regional Medical Centre)', product_code: 'labconnect' },
  // Epworth
  { client_name: 'Epworth Healthcare', product_code: 'medsuite' },
  { client_name: 'Epworth Healthcare', product_code: 'patient-portal' },
  { client_name: 'Epworth Healthcare', product_code: 'analytics' },
  // Waikato
  { client_name: 'Te Whatu Ora Waikato', product_code: 'medsuite' },
  { client_name: 'Te Whatu Ora Waikato', product_code: 'labconnect' },
  // Barwon
  { client_name: 'Barwon Health Australia', product_code: 'medsuite' },
  { client_name: 'Barwon Health Australia', product_code: 'analytics' },
  // Western Health
  { client_name: 'Western Health', product_code: 'medsuite' },
  { client_name: 'Western Health', product_code: 'patient-portal' },
  // RVEEH
  { client_name: 'The Royal Victorian Eye and Ear Hospital', product_code: 'medsuite' },
  // GHA Regional
  { client_name: 'Gippsland Health Alliance', product_code: 'medsuite' },
  { client_name: 'Gippsland Health Alliance', product_code: 'analytics' },
  // MINDEF
  { client_name: 'Ministry of Defence, Singapore', product_code: 'medsuite' },
  { client_name: 'Ministry of Defence, Singapore', product_code: 'mobile' },
  // Mount Alvernia
  { client_name: 'Mount Alvernia Hospital', product_code: 'medsuite' },
  { client_name: 'Mount Alvernia Hospital', product_code: 'patient-portal' },
  // Albury Wodonga
  { client_name: 'Albury Wodonga Health', product_code: 'medsuite' },
  // DoH Victoria
  { client_name: 'Department of Health - Victoria', product_code: 'medsuite' },
  { client_name: 'Department of Health - Victoria', product_code: 'analytics' },
  // Northern Health
  { client_name: 'Northern Health', product_code: 'medsuite' },
  { client_name: 'Northern Health', product_code: 'patient-portal' },
  // Austin Health
  { client_name: 'Austin Health', product_code: 'medsuite' },
  { client_name: 'Austin Health', product_code: 'labconnect' },
  { client_name: 'Austin Health', product_code: 'analytics' },
  // Mercy
  { client_name: 'Mercy Aged Care', product_code: 'medsuite' },
]

async function applyMigration() {
  console.log('=== Applying Products Migration ===\n')

  // Step 1: Create products table via direct SQL using pg connection
  const sqlPath = path.join(__dirname, '../docs/migrations/20260101_products_tables.sql')
  console.log('SQL file path:', sqlPath)

  // For now, let's use the REST API to insert data
  // First check if tables exist by trying to insert

  console.log('Step 1: Inserting products...')
  let productsInserted = 0
  for (const product of PRODUCTS) {
    const { data, error } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'code' })
      .select()

    if (error) {
      if (error.code === '42P01') {
        console.log('\n❌ Table "products" does not exist.')
        console.log('Please run the SQL migration manually in Supabase Dashboard:')
        console.log(`File: docs/migrations/20260101_products_tables.sql`)
        return
      }
      console.log(`  ❌ ${product.name}: ${error.message}`)
    } else {
      productsInserted++
      console.log(`  ✓ ${product.name}`)
    }
  }

  console.log(`\nStep 2: Inserting client products (${CLIENT_PRODUCTS.length} mappings)...`)
  let clientProductsInserted = 0
  for (const mapping of CLIENT_PRODUCTS) {
    const { error } = await supabase
      .from('client_products')
      .upsert({ ...mapping, status: 'active' }, { onConflict: 'client_name,product_code' })

    if (error) {
      if (error.code === '42P01') {
        console.log('\n❌ Table "client_products" does not exist.')
        console.log('Please run the SQL migration manually.')
        return
      }
      // Ignore duplicate errors
      if (!error.message.includes('duplicate')) {
        console.log(`  ❌ ${mapping.client_name} - ${mapping.product_code}: ${error.message}`)
      }
    } else {
      clientProductsInserted++
    }
  }
  console.log(`  ✓ Inserted ${clientProductsInserted} client-product mappings`)

  console.log('\n=== Migration Complete ===')
  console.log(`Products: ${productsInserted}`)
  console.log(`Client mappings: ${clientProductsInserted}`)
}

applyMigration().catch(console.error)
