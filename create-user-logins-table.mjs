/**
 * Create user_logins table for tracking Azure AD sign-ins
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTable() {
  console.log('Creating user_logins table...\n');

  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      -- Create user_logins table
      CREATE TABLE IF NOT EXISTS user_logins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_email TEXT NOT NULL,
        user_name TEXT,
        provider TEXT DEFAULT 'azure-ad',
        ip_address TEXT,
        user_agent TEXT,
        signed_in_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Create index for faster lookups by email
      CREATE INDEX IF NOT EXISTS idx_user_logins_email ON user_logins(user_email);
      
      -- Create index for time-based queries
      CREATE INDEX IF NOT EXISTS idx_user_logins_signed_in_at ON user_logins(signed_in_at DESC);

      -- Enable RLS
      ALTER TABLE user_logins ENABLE ROW LEVEL SECURITY;

      -- Policy: Service role can do everything
      DROP POLICY IF EXISTS "Service role full access" ON user_logins;
      CREATE POLICY "Service role full access" ON user_logins
        FOR ALL
        USING (true)
        WITH CHECK (true);

      -- Grant permissions
      GRANT ALL ON user_logins TO service_role;
      GRANT SELECT ON user_logins TO authenticated;
    `
  });

  if (error) {
    // Try alternative approach - direct SQL via REST
    console.log('RPC not available, using direct table creation...');
    
    // Check if table exists
    const { data: existingTable, error: checkError } = await supabase
      .from('user_logins')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.code === '42P01') {
      console.log('Table does not exist. Please create it via Supabase SQL editor:');
      console.log(`
-- Run this SQL in Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS user_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_name TEXT,
  provider TEXT DEFAULT 'azure-ad',
  ip_address TEXT,
  user_agent TEXT,
  signed_in_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_logins_email ON user_logins(user_email);
CREATE INDEX IF NOT EXISTS idx_user_logins_signed_in_at ON user_logins(signed_in_at DESC);

ALTER TABLE user_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON user_logins
  FOR ALL
  USING (true)
  WITH CHECK (true);
      `);
    } else if (!checkError) {
      console.log('✅ Table already exists!');
    } else {
      console.error('Error:', checkError);
    }
  } else {
    console.log('✅ Table created successfully!');
  }
}

createTable();
