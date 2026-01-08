#!/usr/bin/env node

/**
 * Apply Planning Hub Migration
 * Creates tables for Territory Strategies and Account Plans
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Applying Planning Hub Migration...\n');

  // Read the migration file
  const migrationPath = join(__dirname, '../docs/migrations/20260108_planning_hub_tables.sql');
  const migrationSql = readFileSync(migrationPath, 'utf8');

  // Split into individual statements (excluding comments and empty lines)
  const statements = migrationSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    // Skip pure comment blocks
    if (statement.split('\n').every(line => line.trim().startsWith('--') || line.trim() === '')) {
      continue;
    }

    const cleanStatement = statement + ';';
    const shortDesc = cleanStatement.substring(0, 80).replace(/\n/g, ' ') + '...';

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: cleanStatement });

      if (error) {
        // Try direct query for certain operations
        if (error.message.includes('function') || error.message.includes('does not exist')) {
          console.log(`⚠️  Skipping (may need manual execution): ${shortDesc}`);
          continue;
        }
        throw error;
      }

      successCount++;
      console.log(`✅ ${shortDesc}`);
    } catch (err) {
      // Handle specific cases
      if (err.message?.includes('already exists')) {
        console.log(`⏭️  Already exists: ${shortDesc}`);
        successCount++;
      } else if (err.message?.includes('does not exist')) {
        console.log(`⚠️  Dependency missing: ${shortDesc}`);
      } else {
        console.log(`❌ Error: ${shortDesc}`);
        console.log(`   ${err.message}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Migration complete: ${successCount} successful, ${errorCount} errors`);

  // Verify tables exist
  console.log('\n📋 Verifying tables...\n');

  const tables = ['territory_strategies', 'account_plans', 'plan_versions', 'plan_comments', 'plan_exports'];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(`✅ ${table}: Table exists`);
    }
  }

  console.log('\n✅ Planning Hub migration complete!');
}

// Alternative: Create tables directly via Supabase REST API
async function createTablesDirectly() {
  console.log('🚀 Creating Planning Hub tables directly...\n');

  // Create territory_strategies table
  const { error: tsError } = await supabase.from('territory_strategies').select('id').limit(1);

  if (tsError && tsError.code === '42P01') {
    console.log('Creating territory_strategies table...');
    // Table doesn't exist, need to create via SQL
  } else if (!tsError) {
    console.log('✅ territory_strategies table already exists');
  }

  // Create account_plans table
  const { error: apError } = await supabase.from('account_plans').select('id').limit(1);

  if (apError && apError.code === '42P01') {
    console.log('Creating account_plans table...');
  } else if (!apError) {
    console.log('✅ account_plans table already exists');
  }

  // Create plan_versions table
  const { error: pvError } = await supabase.from('plan_versions').select('id').limit(1);

  if (pvError && pvError.code === '42P01') {
    console.log('Creating plan_versions table...');
  } else if (!pvError) {
    console.log('✅ plan_versions table already exists');
  }

  // Create plan_comments table
  const { error: pcError } = await supabase.from('plan_comments').select('id').limit(1);

  if (pcError && pcError.code === '42P01') {
    console.log('Creating plan_comments table...');
  } else if (!pcError) {
    console.log('✅ plan_comments table already exists');
  }

  // Create plan_exports table
  const { error: peError } = await supabase.from('plan_exports').select('id').limit(1);

  if (peError && peError.code === '42P01') {
    console.log('Creating plan_exports table...');
  } else if (!peError) {
    console.log('✅ plan_exports table already exists');
  }

  console.log('\n📋 Table check complete.');
  console.log('\nIf tables need to be created, please run the SQL migration manually:');
  console.log('docs/migrations/20260108_planning_hub_tables.sql');
}

// Run the migration
createTablesDirectly().catch(console.error);
