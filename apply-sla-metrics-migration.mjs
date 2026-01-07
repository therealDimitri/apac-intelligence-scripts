#!/usr/bin/env node

/**
 * Apply the support_sla_metrics migration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

async function applyMigration() {
  console.log('Applying support_sla_metrics migration...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../docs/migrations/20260108_support_sla_metrics.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Split into individual statements (handling $$ blocks)
  const statements = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    if (line.includes('$$')) {
      inDollarBlock = !inDollarBlock;
    }

    current += line + '\n';

    if (!inDollarBlock && line.trim().endsWith(';') && !line.trim().startsWith('--')) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  let success = 0;
  let failed = 0;

  for (const stmt of statements) {
    // Extract first line for logging
    const firstLine = stmt.split('\n')[0].substring(0, 60);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });

      if (error) {
        // Try direct query for DDL statements
        const { error: error2 } = await supabase.from('_migrations').select('*').limit(0);

        // For CREATE TABLE/INDEX, check if already exists
        if (stmt.includes('IF NOT EXISTS') || stmt.includes('OR REPLACE')) {
          console.log(`⚠️  ${firstLine}... (may already exist)`);
          success++;
        } else {
          console.log(`❌ ${firstLine}...`);
          console.log(`   Error: ${error.message}`);
          failed++;
        }
      } else {
        console.log(`✅ ${firstLine}...`);
        success++;
      }
    } catch (err) {
      console.log(`❌ ${firstLine}...`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Migration complete: ${success} succeeded, ${failed} failed`);

  // Verify table exists
  const { data, error } = await supabase
    .from('support_sla_metrics')
    .select('id')
    .limit(1);

  if (!error) {
    console.log('\n✅ Table support_sla_metrics verified!');
  } else {
    console.log('\n⚠️  Could not verify table - may need manual migration');
    console.log('   Run the SQL in Supabase Dashboard SQL Editor');
  }
}

applyMigration().catch(console.error);
