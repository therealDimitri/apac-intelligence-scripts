#!/usr/bin/env node

/**
 * Execute Semantic Search Migration via Direct PostgreSQL Connection
 */

import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local' })

const { Client } = pg

// Use pooler connection (more reliable)
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ No DATABASE_URL found')
  process.exit(1)
}

const MIGRATION_SQL = `
-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Function: match_documents
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_content_type text DEFAULT NULL,
  filter_client text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  content_type text,
  source_table text,
  source_id text,
  client_name text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.content,
    de.content_type,
    de.source_table,
    de.source_id,
    de.client_name,
    de.metadata,
    1 - (de.embedding <=> query_embedding) as similarity
  FROM document_embeddings de
  WHERE
    (filter_content_type IS NULL OR de.content_type = filter_content_type)
    AND (filter_client IS NULL OR de.client_name ILIKE '%' || filter_client || '%')
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents IS 'Search for similar documents using cosine similarity on embeddings.';

-- Create conversation_embeddings table if not exists
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  message_role text NOT NULL,
  message_content text NOT NULL,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

-- Function: match_conversation_embeddings
CREATE OR REPLACE FUNCTION match_conversation_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  message_role text,
  message_content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.conversation_id,
    ce.message_role,
    ce.message_content,
    1 - (ce.embedding <=> query_embedding) as similarity
  FROM conversation_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_conversation_embeddings IS 'Search for similar past conversations using cosine similarity.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_documents TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION match_conversation_embeddings TO authenticated, anon, service_role;
GRANT ALL ON TABLE conversation_embeddings TO authenticated, service_role;
GRANT SELECT ON TABLE conversation_embeddings TO anon;
`

async function main() {
  console.log('=' .repeat(60))
  console.log('EXECUTING SEMANTIC SEARCH MIGRATION')
  console.log('=' .repeat(60))
  console.log('')

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('📡 Connecting to database...')
    await client.connect()
    console.log('   ✓ Connected')

    console.log('')
    console.log('📝 Executing migration...')

    await client.query(MIGRATION_SQL)

    console.log('   ✓ Migration executed successfully')

    // Verify functions exist
    console.log('')
    console.log('🔍 Verifying functions...')

    const checkQuery = `
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_name IN ('match_documents', 'match_conversation_embeddings')
      AND routine_type = 'FUNCTION'
    `
    const result = await client.query(checkQuery)

    const functions = result.rows.map(r => r.routine_name)
    console.log(`   ✓ match_documents: ${functions.includes('match_documents') ? 'EXISTS' : 'MISSING'}`)
    console.log(`   ✓ match_conversation_embeddings: ${functions.includes('match_conversation_embeddings') ? 'EXISTS' : 'MISSING'}`)

    console.log('')
    console.log('=' .repeat(60))
    console.log('✅ MIGRATION COMPLETE')
    console.log('=' .repeat(60))
    console.log('')
    console.log('AI Workflows should now function correctly.')

  } catch (error) {
    console.error('')
    console.error('❌ Migration failed:', error.message)

    if (error.message.includes('vector')) {
      console.error('')
      console.error('   The pgvector extension may not be available.')
      console.error('   This is required for semantic search functionality.')
    }

    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
