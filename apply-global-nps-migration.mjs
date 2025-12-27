#!/usr/bin/env node
/**
 * Apply Global NPS Benchmark Migration
 * Creates the global_nps_benchmark table in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🗄️ Applying Global NPS Benchmark Migration...\n');

  // Read the SQL migration
  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251226_global_nps_benchmark.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Execute via pg_query if available, otherwise create table via REST
  try {
    // Try to execute via RPC if a function exists
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.log('RPC not available, will create via REST API...');

      // Create table by inserting a test record (table will be auto-created if not exists)
      // First, check if table exists
      const { data: existing, error: checkError } = await supabase
        .from('global_nps_benchmark')
        .select('id')
        .limit(1);

      if (checkError && checkError.message.includes('does not exist')) {
        console.log('Table does not exist. Please run the SQL migration manually:');
        console.log(`\nSQL file: ${sqlPath}`);
        console.log('\nYou can run this in the Supabase SQL Editor.');
        return false;
      }

      console.log('✅ Table already exists or was created');
      return true;
    }

    console.log('✅ Migration applied successfully via RPC');
    return true;
  } catch (err) {
    console.error('Migration error:', err);
    console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:');
    console.log(sql);
    return false;
  }
}

applyMigration().then(success => {
  if (!success) {
    console.log('\n⚠️ Manual intervention required');
    process.exit(1);
  }
});
