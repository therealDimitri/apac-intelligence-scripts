#!/usr/bin/env node
/**
 * Refresh event_compliance_summary materialized view
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

// Use direct database connection for DDL operations (materialized view refresh)
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

console.log('Connecting to database (session mode)...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected. Refreshing event_compliance_summary...');

    await client.query('REFRESH MATERIALIZED VIEW event_compliance_summary;');
    console.log('✅ event_compliance_summary refreshed');

    // Verify GHA
    const result = await client.query(`
      SELECT client_name, overall_compliance_score, compliant_event_types_count, total_event_types_count
      FROM event_compliance_summary
      WHERE client_name = 'Gippsland Health Alliance (GHA)' AND year = 2025
    `);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('\nGHA Compliance after refresh:');
      console.log(`  Score: ${row.overall_compliance_score}%`);
      console.log(`  Compliant: ${row.compliant_event_types_count}/${row.total_event_types_count} event types`);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
