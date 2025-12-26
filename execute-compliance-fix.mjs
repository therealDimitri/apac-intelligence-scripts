#!/usr/bin/env node
/**
 * Execute the compliance calculation fix migration via Supabase
 */

import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const sql = fs.readFileSync(
  join(__dirname, '../docs/migrations/20251216_fix_compliance_calculation_bug.sql'),
  'utf8'
);

console.log('Attempting to execute migration...');

// Try using Supabase RPC endpoint
const response = await fetch(
  process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/exec_sql',
  {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: sql })
  }
);

if (!response.ok) {
  const text = await response.text();
  console.log('RPC not available:', response.status);
  console.log('');
  console.log('Please apply the migration manually:');
  console.log('1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new');
  console.log('2. Paste the migration SQL and run');
  console.log('');
  console.log('Opening the migration file for you...');

  // Try to open the file
  const { exec } = await import('child_process');
  exec(`open "${join(__dirname, '../docs/migrations/20251216_fix_compliance_calculation_bug.sql')}"`);
} else {
  const data = await response.json();
  console.log('Success:', data);
}
