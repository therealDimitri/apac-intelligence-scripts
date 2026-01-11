#!/usr/bin/env node
/**
 * Create strategic_plans table for the planning feature
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

console.log('Connecting to database...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected.');

    console.log('\n1. Creating strategic_plans table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS strategic_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_type TEXT NOT NULL DEFAULT 'territory',
        fiscal_year INTEGER NOT NULL DEFAULT 2026,
        primary_owner TEXT NOT NULL,
        primary_owner_role TEXT,
        territory TEXT,
        client_name TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        portfolio_data JSONB DEFAULT '[]'::jsonb,
        snapshot_data JSONB DEFAULT '{}'::jsonb,
        stakeholders_data JSONB DEFAULT '[]'::jsonb,
        opportunities_data JSONB DEFAULT '[]'::jsonb,
        risks_data JSONB DEFAULT '[]'::jsonb,
        actions_data JSONB DEFAULT '[]'::jsonb,
        collaborators TEXT[] DEFAULT '{}',
        completion_percentage INTEGER DEFAULT 0,
        summary_notes TEXT,
        next_review_date DATE,
        submitted_at TIMESTAMPTZ,
        submitted_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Table created');

    console.log('\n2. Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_strategic_plans_owner ON strategic_plans(primary_owner);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_strategic_plans_status ON strategic_plans(status);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_strategic_plans_fiscal_year ON strategic_plans(fiscal_year);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_strategic_plans_client ON strategic_plans(client_name);');
    console.log('✅ Indexes created');

    console.log('\n3. Granting permissions...');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON strategic_plans TO anon, authenticated;');
    console.log('✅ Permissions granted');

    console.log('\n4. Notifying PostgREST...');
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema reload notification sent');

    console.log('\n🎉 strategic_plans table created successfully!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
