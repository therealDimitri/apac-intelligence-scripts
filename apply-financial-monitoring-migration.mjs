#!/usr/bin/env node
/**
 * Apply Financial Monitoring Migration
 * Creates tables, triggers, and views for financial monitoring and actions
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
  // Use direct connection for DDL operations
  const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_DIRECT or DATABASE_URL not found');
    process.exit(1);
  }

  console.log('📊 Applying Financial Monitoring Migration...');
  console.log('   Using:', databaseUrl.includes('pooler') ? 'Pooler connection' : 'Direct connection');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20251228_financial_monitoring_and_actions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Split by major sections and execute
    const sections = sql.split(/-- ={10,}/g).filter(s => s.trim());

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section || section.startsWith('-- COMPLETE')) continue;

      // Extract section name from first comment
      const nameMatch = section.match(/--\s*\d+\.\s*([^\n]+)/);
      const sectionName = nameMatch ? nameMatch[1].trim() : `Section ${i + 1}`;

      console.log(`\n📌 Executing: ${sectionName}`);

      try {
        await client.query(section);
        console.log(`   ✅ Success`);
      } catch (err) {
        // Some errors are expected (like "already exists")
        if (err.message.includes('already exists') || err.message.includes('does not exist')) {
          console.log(`   ⚠️ Skipped (${err.message.split('\n')[0]})`);
        } else if (err.message.includes('duplicate key')) {
          console.log(`   ⚠️ Skipped (data already exists)`);
        } else {
          console.error(`   ❌ Error: ${err.message}`);
        }
      }
    }

    // Verify tables created
    console.log('\n📋 Verifying tables...');

    const tables = ['financial_alerts', 'financial_actions'];
    for (const table of tables) {
      const result = await client.query(`
        SELECT COUNT(*) as count FROM ${table}
      `);
      console.log(`   ✅ ${table}: ${result.rows[0].count} rows`);
    }

    // Check views
    console.log('\n📋 Verifying views...');
    const views = ['v_priority_financial_actions', 'v_financial_health_dashboard'];
    for (const view of views) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${view}`);
        console.log(`   ✅ ${view}: ${result.rows[0].count} rows`);
      } catch (err) {
        console.log(`   ❌ ${view}: ${err.message}`);
      }
    }

    // Show sample alerts
    console.log('\n📊 Sample Financial Alerts:');
    const alerts = await client.query(`
      SELECT alert_type, severity, client_name, title, financial_impact
      FROM financial_alerts
      ORDER BY priority_score DESC
      LIMIT 5
    `);

    alerts.rows.forEach((alert, i) => {
      console.log(`   ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.client_name}: ${alert.title}`);
      console.log(`      Impact: $${(alert.financial_impact / 1000).toFixed(0)}K`);
    });

    console.log('\n✅ Migration complete!');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
