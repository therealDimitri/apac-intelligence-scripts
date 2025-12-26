#!/usr/bin/env node
/**
 * Apply the compliance calculation fix migration
 * Fixes the bug where AVG(compliance_percentage) allowed over-servicing to mask under-servicing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('=== APPLYING COMPLIANCE CALCULATION FIX ===\n');

  // Read migration file
  const migrationPath = join(__dirname, '../docs/migrations/20251216_fix_compliance_calculation_bug.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Migration file loaded:', migrationPath);
  console.log('');

  // Unfortunately, Supabase JS client doesn't support raw SQL execution
  // We need to use the Management API or run via dashboard

  console.log('To apply this migration, please run it in Supabase SQL Editor:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new');
  console.log('2. Paste the contents of: docs/migrations/20251216_fix_compliance_calculation_bug.sql');
  console.log('3. Click "Run"');
  console.log('');
  console.log('Or use the command:');
  console.log('open "' + migrationPath + '"');
  console.log('');

  // Show expected impact
  console.log('=== EXPECTED IMPACT ===');
  console.log('');

  // Check current values for affected clients
  const { data: current } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, compliance_percentage')
    .order('client_name');

  const { data: compData } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, compliance_percentage')
    .eq('year', 2025);

  // Calculate expected new values
  const compByClient = {};
  compData?.forEach(r => {
    if (!compByClient[r.client_name]) {
      compByClient[r.client_name] = { total: 0, onTarget: 0 };
    }
    compByClient[r.client_name].total++;
    if (r.compliance_percentage >= 100) {
      compByClient[r.client_name].onTarget++;
    }
  });

  console.log('Clients that will be affected:');
  console.log('');
  console.log('Client Name                          | Current | New   | Change');
  console.log('-'.repeat(70));

  let affectedCount = 0;
  current?.forEach(c => {
    const comp = compByClient[c.client_name];
    if (comp && comp.total > 0) {
      const newCompliance = Math.round((comp.onTarget / comp.total) * 100);
      const newNpsComponent = ((0 + 100) / 200) * 40; // Assume NPS=0 for simplicity

      // Get actual NPS from current data
      const npsComponent = ((c.compliance_percentage || 0) <= 100)
        ? (c.health_score - (c.compliance_percentage / 100 * 60))
        : (c.health_score - 60);

      const expectedNewScore = Math.round(npsComponent + (newCompliance / 100 * 60));

      if (Math.abs(expectedNewScore - c.health_score) > 2) {
        affectedCount++;
        const change = expectedNewScore - c.health_score;
        const changeStr = change > 0 ? `+${change}` : change.toString();
        console.log(
          `${c.client_name.padEnd(36)} | ${String(c.health_score).padStart(6)}% | ${String(expectedNewScore).padStart(4)}% | ${changeStr}%`
        );
      }
    }
  });

  console.log('');
  console.log(`Total clients affected: ${affectedCount}`);
}

applyMigration().catch(console.error);
