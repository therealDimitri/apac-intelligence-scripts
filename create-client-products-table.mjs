import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Product definitions with descriptions
const PRODUCTS = [
  {
    code: 'medsuite',
    name: 'MedSuite Enterprise',
    category: 'Clinical',
    description: 'Comprehensive clinical information system for hospitals',
    icon: 'heart-pulse',
  },
  {
    code: 'labconnect',
    name: 'LabConnect Pro',
    category: 'Laboratory',
    description: 'Laboratory information and workflow management system',
    icon: 'flask',
  },
  {
    code: 'patient-portal',
    name: 'PatientPortal',
    category: 'Engagement',
    description: 'Patient engagement and self-service portal',
    icon: 'users',
  },
  {
    code: 'analytics',
    name: 'Analytics Plus',
    category: 'Analytics',
    description: 'Business intelligence and reporting platform',
    icon: 'bar-chart',
  },
  {
    code: 'mobile',
    name: 'Mobile Health',
    category: 'Mobile',
    description: 'Mobile applications for clinicians and patients',
    icon: 'smartphone',
  },
  {
    code: 'radiology',
    name: 'RadConnect',
    category: 'Imaging',
    description: 'Radiology information and PACS integration',
    icon: 'scan',
  },
  {
    code: 'pharmacy',
    name: 'PharmaSuite',
    category: 'Pharmacy',
    description: 'Pharmacy management and medication tracking',
    icon: 'pill',
  },
]

// Client-product mappings based on known deployments
const CLIENT_PRODUCTS = {
  'Minister for Health aka South Australia Health': ['medsuite', 'labconnect', 'patient-portal', 'analytics', 'radiology', 'pharmacy'],
  'Singapore Health Services Pte Ltd': ['medsuite', 'labconnect', 'analytics', 'mobile'],
  'Grampians Health Alliance': ['medsuite', 'patient-portal', 'analytics'],
  'Western Australia Department Of Health': ['medsuite', 'labconnect', 'radiology'],
  "St Luke's Medical Center Global City Inc": ['medsuite', 'patient-portal', 'pharmacy'],
  'GRMC (Guam Regional Medical Centre)': ['medsuite', 'labconnect'],
  'Epworth Healthcare': ['medsuite', 'patient-portal', 'analytics'],
  'Te Whatu Ora Waikato': ['medsuite', 'labconnect'],
  'Barwon Health Australia': ['medsuite', 'analytics'],
  'Western Health': ['medsuite', 'patient-portal'],
  'The Royal Victorian Eye and Ear Hospital': ['medsuite'],
  'Gippsland Health Alliance': ['medsuite', 'analytics'],
  'Ministry of Defence, Singapore': ['medsuite', 'mobile'],
  'Mount Alvernia Hospital': ['medsuite', 'patient-portal'],
  'Albury Wodonga Health': ['medsuite'],
  'Department of Health - Victoria': ['medsuite', 'analytics'],
  'Northern Health': ['medsuite', 'patient-portal'],
  'Austin Health': ['medsuite', 'labconnect', 'analytics'],
  'Mercy Aged Care': ['medsuite'],
}

async function createTable() {
  console.log('=== Creating Products and Client Products Tables ===\n')

  // Check if products table exists by trying to select from it
  const { error: checkError } = await supabase
    .from('products')
    .select('id')
    .limit(1)

  if (checkError && checkError.code === '42P01') {
    console.log('Tables do not exist - they need to be created via Supabase dashboard')
    console.log('\nRun this SQL in Supabase SQL Editor:\n')
    console.log(`
-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Client products mapping table
CREATE TABLE IF NOT EXISTS client_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  product_code TEXT NOT NULL REFERENCES products(code),
  implementation_date DATE,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_name, product_code)
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_products ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access" ON products FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON client_products FOR SELECT USING (true);
    `)
    return
  }

  // Insert products
  console.log('Inserting products...')
  for (const product of PRODUCTS) {
    const { error } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'code' })

    if (error) {
      console.log(`  Error inserting ${product.name}: ${error.message}`)
    } else {
      console.log(`  ✓ ${product.name}`)
    }
  }

  // Insert client-product mappings
  console.log('\nInserting client products...')
  for (const [clientName, productCodes] of Object.entries(CLIENT_PRODUCTS)) {
    for (const productCode of productCodes) {
      const { error } = await supabase
        .from('client_products')
        .upsert(
          {
            client_name: clientName,
            product_code: productCode,
            status: 'active'
          },
          { onConflict: 'client_name,product_code' }
        )

      if (error) {
        console.log(`  Error: ${clientName} - ${productCode}: ${error.message}`)
      }
    }
    console.log(`  ✓ ${clientName}: ${productCodes.join(', ')}`)
  }

  console.log('\n=== Done ===')
}

createTable().catch(console.error)
