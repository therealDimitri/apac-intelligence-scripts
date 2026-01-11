#!/usr/bin/env node
/**
 * Apply compliance view fix to use client_aliases
 * This fixes the bug where events stored under "Waikato" weren't matching "Te Whatu Ora Waikato"
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

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

    // Step 1: Add Waikato aliases
    console.log('\n1. Adding Waikato client aliases...');
    try {
      const aliasesSQL = readFileSync(
        join(__dirname, '..', 'supabase/migrations/20260111_add_waikato_client_aliases.sql'),
        'utf-8'
      );
      await client.query(aliasesSQL);
      console.log('✅ Client aliases added');
    } catch (aliasErr) {
      console.log('⚠️  Aliases already exist or minor error:', aliasErr.message);
    }

    // Step 2: Check current Waikato events
    console.log('\n2. Checking Waikato events in database...');
    const eventsCheck = await client.query(`
      SELECT DISTINCT client_name
      FROM segmentation_events
      WHERE LOWER(client_name) LIKE '%waikato%'
      LIMIT 10
    `);
    console.log('  Waikato event names found:', eventsCheck.rows.map(r => r.client_name));

    // Step 3: Update the materialized view with alias resolution
    console.log('\n3. Updating compliance materialized view with alias resolution...');
    const viewSQL = readFileSync(
      join(__dirname, '..', 'supabase/migrations/20260111_fix_compliance_view_client_aliases.sql'),
      'utf-8'
    );
    await client.query(viewSQL);
    console.log('✅ Materialized view updated');

    // Step 4: Verify Waikato compliance
    console.log('\n4. Verifying Te Whatu Ora Waikato compliance...');
    const waikatoCheck = await client.query(`
      SELECT client_name, year, overall_compliance_score, compliant_event_types_count, total_event_types_count
      FROM event_compliance_summary
      WHERE client_name = 'Te Whatu Ora Waikato'
      ORDER BY year DESC
    `);

    if (waikatoCheck.rows.length > 0) {
      console.log('\n✅ Te Whatu Ora Waikato compliance data:');
      waikatoCheck.rows.forEach(row => {
        console.log(`  ${row.year}: ${row.overall_compliance_score}% (${row.compliant_event_types_count}/${row.total_event_types_count} event types)`);
      });
    } else {
      console.log('\n⚠️  No compliance data found for Te Whatu Ora Waikato');
      console.log('  This may indicate events are stored under a different name');

      // Check what names are in events
      const allEvents = await client.query(`
        SELECT DISTINCT client_name, COUNT(*) as count
        FROM segmentation_events
        WHERE event_year = 2025
        GROUP BY client_name
        ORDER BY client_name
      `);
      console.log('\n  All clients with 2025 events:');
      allEvents.rows.forEach(r => console.log(`    ${r.client_name}: ${r.count} events`));
    }

    // Step 5: Notify PostgREST
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Schema reload notification sent');

    console.log('\n🎉 Migration complete! Refresh the segmentation page to see updated compliance.');

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
