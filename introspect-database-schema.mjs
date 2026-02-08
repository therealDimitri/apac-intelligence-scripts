#!/usr/bin/env node
/**
 * Database Schema Introspection Script
 *
 * This script queries the actual Supabase database schema to generate
 * a comprehensive field mapping document. This prevents column mismatch
 * issues by documenting the source of truth.
 *
 * Usage: node scripts/introspect-database-schema.mjs
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Tables to introspect
const TABLES = [
  'actions',
  'unified_meetings',
  'nps_responses',
  'client_segmentation',
  'topics',
  'feedback_analysis',
  'aging_accounts',
  'critical_alerts',
  'notifications',
  'portfolio_initiatives',
  'nps_topic_classifications',
  'nps_period_config',
  // ChaSen AI tables
  'chasen_knowledge',
  'chasen_feedback',
  'chasen_knowledge_suggestions',
  'chasen_learning_patterns',
  'chasen_conversations',
  'chasen_folders',
  // Health history tracking
  'client_health_history',
  'health_status_alerts',
  // Goals & Initiatives system
  'company_goals',
  'team_goals',
  'goal_templates',
  'goal_check_ins',
  'goal_dependencies',
  'goal_approvals',
  'goal_audit_log',
  'goal_status_updates',
  'custom_roles',
  'user_role_assignments',
  'role_mapping_rules',
  'ms_graph_sync_log',
]

async function introspectSchema() {
  console.log('🔍 Starting database schema introspection...\n')

  const schemaMap = {}

  for (const tableName of TABLES) {
    console.log(`📋 Introspecting table: ${tableName}`)

    try {
      // Query information_schema to get column details
      const { data: columns, error } = await supabase.rpc('exec_sql', {
        query: `
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = '${tableName}'
          ORDER BY ordinal_position;
        `
      })

      // If exec_sql doesn't work, try direct query method
      if (error || !columns) {
        console.log(`   Using alternate method for ${tableName}...`)

        // Get a sample row to infer schema
        const { data: sampleData, error: sampleError } = await supabase
          .from(tableName)
          .select('*')
          .limit(1)
          .single()

        if (sampleError && sampleError.code !== 'PGRST116') {
          console.error(`   ❌ Error: ${sampleError.message}`)
          continue
        }

        if (sampleData) {
          const inferredColumns = Object.keys(sampleData).map(key => ({
            column_name: key,
            data_type: inferType(sampleData[key]),
            is_nullable: 'UNKNOWN',
            inferred: true
          }))

          schemaMap[tableName] = {
            columns: inferredColumns,
            row_count: await getRowCount(tableName)
          }
          console.log(`   ✓ Found ${inferredColumns.length} columns (inferred from data)`)
        } else {
          console.log(`   ⚠️  Table is empty, checking RLS policies...`)

          // Try with service role to bypass RLS
          const { data: schemaData, error: schemaError } = await supabase
            .from(tableName)
            .select('*')
            .limit(0)

          if (!schemaError) {
            // Even with no data, we can see the structure in the error response
            schemaMap[tableName] = {
              columns: [],
              row_count: 0,
              note: 'Empty table or RLS blocking access'
            }
          }
        }
      } else {
        schemaMap[tableName] = {
          columns: columns,
          row_count: await getRowCount(tableName)
        }
        console.log(`   ✓ Found ${columns.length} columns`)
      }
    } catch (err) {
      console.error(`   ❌ Error introspecting ${tableName}:`, err.message)
      schemaMap[tableName] = {
        error: err.message
      }
    }
  }

  return schemaMap
}

function inferType(value) {
  if (value === null) return 'unknown'
  if (typeof value === 'string') return 'text'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'numeric'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'jsonb'
  return 'unknown'
}

async function getRowCount(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    return error ? 'unknown' : count
  } catch {
    return 'unknown'
  }
}

function generateMarkdownDoc(schemaMap) {
  let markdown = `# Database Schema Documentation\n\n`
  markdown += `**Generated**: ${new Date().toISOString()}\n`
  markdown += `**Purpose**: Source of truth for all database table schemas\n\n`
  markdown += `---\n\n`

  markdown += `## Overview\n\n`
  markdown += `This document provides the authoritative schema definition for all tables in the APAC Intelligence database. **Always reference this document when writing queries or TypeScript interfaces.**\n\n`

  for (const [tableName, schema] of Object.entries(schemaMap)) {
    markdown += `## Table: \`${tableName}\`\n\n`

    if (schema.error) {
      markdown += `⚠️ **Error**: ${schema.error}\n\n`
      continue
    }

    if (schema.row_count !== undefined) {
      markdown += `**Row Count**: ${schema.row_count}\n\n`
    }

    if (schema.note) {
      markdown += `**Note**: ${schema.note}\n\n`
    }

    if (schema.columns && schema.columns.length > 0) {
      markdown += `### Columns\n\n`
      markdown += `| Column Name | Data Type | Nullable | Default | Notes |\n`
      markdown += `|-------------|-----------|----------|---------|-------|\n`

      for (const col of schema.columns) {
        const nullable = col.is_nullable === 'YES' ? '✓' : '✗'
        const defaultVal = col.column_default || '-'
        const notes = col.inferred ? '*(inferred)*' : ''

        markdown += `| \`${col.column_name}\` | ${col.data_type} | ${nullable} | ${defaultVal} | ${notes} |\n`
      }

      markdown += `\n`
    }

    markdown += `---\n\n`
  }

  return markdown
}

function generateTypeScriptTypes(schemaMap) {
  let typescript = `/* eslint-disable @typescript-eslint/no-explicit-any */\n`
  typescript += `/**\n`
  typescript += ` * AUTO-GENERATED TypeScript Types from Database Schema\n`
  typescript += ` * Generated: ${new Date().toISOString()}\n`
  typescript += ` * \n`
  typescript += ` * ⚠️  DO NOT EDIT THIS FILE MANUALLY\n`
  typescript += ` * \n`
  typescript += ` * This file is auto-generated from the database schema.\n`
  typescript += ` * To update, run: npm run introspect-schema\n`
  typescript += ` */\n\n`

  for (const [tableName, schema] of Object.entries(schemaMap)) {
    if (schema.error || !schema.columns || schema.columns.length === 0) {
      continue
    }

    const typeName = toPascalCase(tableName) + 'Row'
    typescript += `export interface ${typeName} {\n`

    for (const col of schema.columns) {
      const tsType = mapPostgresToTypeScript(col.data_type)
      const optional = col.is_nullable === 'YES' ? '?' : ''
      typescript += `  ${col.column_name}${optional}: ${tsType}\n`
    }

    typescript += `}\n\n`
  }

  return typescript
}

function toPascalCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function mapPostgresToTypeScript(pgType) {
  const typeMap = {
    'integer': 'number',
    'bigint': 'number',
    'numeric': 'number',
    'real': 'number',
    'double precision': 'number',
    'text': 'string',
    'character varying': 'string',
    'varchar': 'string',
    'character': 'string',
    'char': 'string',
    'boolean': 'boolean',
    'timestamp with time zone': 'string',
    'timestamp without time zone': 'string',
    'date': 'string',
    'time': 'string',
    'uuid': 'string',
    'json': 'any',
    'jsonb': 'any',
    'array': 'any[]',
    'unknown': 'any'
  }

  return typeMap[pgType.toLowerCase()] || 'any'
}

// Main execution
async function main() {
  try {
    const schemaMap = await introspectSchema()

    // Generate markdown documentation
    const markdown = generateMarkdownDoc(schemaMap)
    const markdownPath = path.join(__dirname, '..', 'docs', 'database-schema.md')
    fs.writeFileSync(markdownPath, markdown, 'utf-8')
    console.log(`\n✅ Generated markdown documentation: ${markdownPath}`)

    // Generate TypeScript types
    const typescript = generateTypeScriptTypes(schemaMap)
    const typesPath = path.join(__dirname, '..', 'src', 'types', 'database.generated.ts')

    // Ensure types directory exists
    const typesDir = path.dirname(typesPath)
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir, { recursive: true })
    }

    fs.writeFileSync(typesPath, typescript, 'utf-8')
    console.log(`✅ Generated TypeScript types: ${typesPath}`)

    // Generate JSON for programmatic access
    const jsonPath = path.join(__dirname, '..', 'docs', 'database-schema.json')
    fs.writeFileSync(jsonPath, JSON.stringify(schemaMap, null, 2), 'utf-8')
    console.log(`✅ Generated JSON schema: ${jsonPath}`)

    console.log('\n🎉 Schema introspection complete!')
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
