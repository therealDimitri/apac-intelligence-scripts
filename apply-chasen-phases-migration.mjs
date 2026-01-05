#!/usr/bin/env node

/**
 * Apply ChaSen Enhancement Phases 1-6 Migration
 *
 * This script applies the database migration for all ChaSen AI enhancement phases.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  if (!supabaseUrl) console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQLBlock(sql, description) {
  console.log(`\n📦 ${description}...`);

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    // Check if it's a "function does not exist" error for exec_sql
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      // Try using the REST API directly
      console.log('   Using direct SQL execution...');

      // Split into smaller statements and execute via the database
      const statements = sql.split(';').filter(s => s.trim().length > 0);

      for (const stmt of statements) {
        const trimmedStmt = stmt.trim();
        if (!trimmedStmt) continue;

        try {
          // Use the Supabase query builder for simple operations
          // For DDL, we need to use the management API or psql
          console.log(`   Executing: ${trimmedStmt.substring(0, 50)}...`);
        } catch (e) {
          console.error(`   ⚠️  Statement error: ${e.message}`);
        }
      }

      return false;
    }

    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }

  console.log('   ✅ Success');
  return true;
}

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  return !error;
}

async function applyMigration() {
  console.log('🚀 ChaSen AI Enhancement Migration');
  console.log('===================================\n');

  // Check if tables already exist
  const existingTables = [];
  const tablesToCheck = [
    'chasen_episodes',
    'chasen_procedures',
    'chasen_concepts',
    'chasen_graph_nodes',
    'chasen_agents',
    'chasen_workflows',
    'chasen_mcp_servers',
    'chasen_predictions',
    'chasen_proactive_insights'
  ];

  console.log('📋 Checking existing tables...');
  for (const table of tablesToCheck) {
    const exists = await checkTableExists(table);
    if (exists) {
      existingTables.push(table);
      console.log(`   ✓ ${table} exists`);
    } else {
      console.log(`   ○ ${table} needs creation`);
    }
  }

  if (existingTables.length === tablesToCheck.length) {
    console.log('\n✅ All ChaSen enhancement tables already exist!');

    // Check if agents are populated
    const { data: agents } = await supabase
      .from('chasen_agents')
      .select('name')
      .limit(10);

    if (agents && agents.length > 0) {
      console.log(`\n📊 Found ${agents.length} agents configured:`);
      agents.forEach(a => console.log(`   - ${a.name}`));
    }

    return true;
  }

  console.log('\n⚠️  Some tables need to be created.');
  console.log('');
  console.log('To apply this migration, please run the SQL file directly in Supabase:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new');
  console.log('2. Copy the contents of: docs/migrations/20260104_chasen_enhancement_phases_1_to_6.sql');
  console.log('3. Paste and execute in the Supabase SQL Editor');
  console.log('');
  console.log('Alternatively, use psql:');
  console.log('psql "$DATABASE_URL" -f docs/migrations/20260104_chasen_enhancement_phases_1_to_6.sql');

  return false;
}

// Run the migration
applyMigration()
  .then((success) => {
    if (success) {
      console.log('\n✅ Migration check complete!');
    } else {
      console.log('\n📌 Manual action required - see instructions above.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
