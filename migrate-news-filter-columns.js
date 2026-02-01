/**
 * Migration: Add Tier 1/2 filter columns to news_articles
 *
 * Adds columns for tracking which articles passed the filtering pipeline:
 * - tier1_passed: Boolean indicating if article passed Tier 1 pre-filters
 * - tier1_reject_reason: Why article was rejected ('no_healthcare_keyword', 'job_posting', 'non_apac_region')
 * - tier2_passed: Boolean indicating if article passed Tier 2 AI healthcare gate
 * - article_type: Classification of article type ('news', 'press_release', 'analysis', 'event')
 */

const { Client } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_DIRECT,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('Connected to database')

    // Add new columns to news_articles
    console.log('Adding filter columns to news_articles...')

    await client.query(`
      ALTER TABLE news_articles
      ADD COLUMN IF NOT EXISTS tier1_passed BOOLEAN,
      ADD COLUMN IF NOT EXISTS tier1_reject_reason TEXT,
      ADD COLUMN IF NOT EXISTS tier2_passed BOOLEAN,
      ADD COLUMN IF NOT EXISTS article_type TEXT;
    `)
    console.log('✅ Added tier1_passed, tier1_reject_reason, tier2_passed, article_type columns')

    // Create news_filter_stats table for tracking filter performance
    console.log('Creating news_filter_stats table...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS news_filter_stats (
        id SERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        articles_ingested INT DEFAULT 0,
        tier1_rejected_no_keyword INT DEFAULT 0,
        tier1_rejected_job_posting INT DEFAULT 0,
        tier1_rejected_non_apac INT DEFAULT 0,
        tier2_rejected INT DEFAULT 0,
        tier3_scored INT DEFAULT 0,
        tier3_above_threshold INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    console.log('✅ Created news_filter_stats table')

    // Create index for efficient querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_news_articles_tier_filters
      ON news_articles (tier1_passed, tier2_passed, is_active);
    `)
    console.log('✅ Created index on filter columns')

    console.log('\n✅ Migration complete!')

  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

migrate()
