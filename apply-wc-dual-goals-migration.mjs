#!/usr/bin/env node
/**
 * Apply Working Capital Dual-Goals Migration
 * Updates client_health_summary materialized view with dual-goal scoring
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const { Client } = pg;

async function applyMigration() {
  const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl === null || databaseUrl === '') {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  console.log('🚀 Applying Working Capital Dual-Goals Migration...');

  const migrationPath = path.join(__dirname, '..', 'docs/migrations/20251228_working_capital_dual_goals.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Set datestyle to handle DD/MM/YYYY format in existing data
    console.log('📦 Setting datestyle to DMY...');
    await client.query("SET datestyle = 'DMY'");

    // Execute the migration
    console.log('📦 Executing migration SQL...');
    await client.query(sql);

    console.log('✅ Migration applied successfully!');

    // Verify the new columns exist
    const result = await client.query(`
      SELECT client_name, nps_score, compliance_percentage,
             percent_under_60_days, percent_under_90_days,
             working_capital_percentage, health_score, status
      FROM client_health_summary
      ORDER BY health_score DESC
      LIMIT 10
    `);

    console.log('\n📊 Top 10 clients by health score:');
    console.table(result.rows);

    // Show clients with working capital data
    const wcResult = await client.query(`
      SELECT client_name,
             percent_under_60_days as "% <60d",
             percent_under_90_days as "% <90d",
             CASE
               WHEN percent_under_60_days >= 90 AND percent_under_90_days >= 100 THEN 'Both Goals Met ✓'
               ELSE 'Goals Not Met'
             END as goal_status,
             health_score
      FROM client_health_summary
      WHERE percent_under_60_days IS NOT NULL
         OR percent_under_90_days IS NOT NULL
      ORDER BY health_score DESC
    `);

    if (wcResult.rows.length > 0) {
      console.log('\n📊 Clients with Working Capital data:');
      console.table(wcResult.rows);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

applyMigration();
