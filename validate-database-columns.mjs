#!/usr/bin/env node
/**
 * Database Column Validation Script
 *
 * This script validates that all Supabase queries in the codebase only
 * reference columns that actually exist in the database schema.
 *
 * Usage: npm run validate-schema
 *
 * This should be run:
 * - Before committing code
 * - Before deployment
 * - In CI/CD pipelines
 * - After schema migrations
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { glob } from 'glob'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCHEMA_PATH = path.join(__dirname, '..', 'docs', 'database-schema.json')
const SRC_DIR = path.join(__dirname, '..', 'src')

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
}

function loadSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`${colors.red}❌ Schema file not found: ${SCHEMA_PATH}${colors.reset}`)
    console.error(`${colors.yellow}💡 Run: npm run introspect-schema${colors.reset}`)
    process.exit(1)
  }

  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'))
}

function findSupabaseQueries(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const queries = []

  // Pattern 1: .from('table').select('columns')
  const pattern1 = /\.from\(['"`](\w+)['"`]\)\s*\.select\(\s*['"`]([^'"`]+)['"`]/g
  let match
  while ((match = pattern1.exec(content)) !== null) {
    const tableName = match[1]
    const columns = match[2]
    const lineNumber = content.substring(0, match.index).split('\n').length

    queries.push({
      file: filePath,
      line: lineNumber,
      table: tableName,
      rawColumns: columns,
      type: 'select'
    })
  }

  // Pattern 2: .from('table').insert({ columns })
  const pattern2 = /\.from\(['"`](\w+)['"`]\)\s*\.insert\(\s*\{([^}]+)\}/g
  while ((match = pattern2.exec(content)) !== null) {
    const tableName = match[1]
    const columns = match[2]
    const lineNumber = content.substring(0, match.index).split('\n').length

    queries.push({
      file: filePath,
      line: lineNumber,
      table: tableName,
      rawColumns: columns,
      type: 'insert'
    })
  }

  // Pattern 3: .from('table').update({ columns })
  const pattern3 = /\.from\(['"`](\w+)['"`]\)\s*\.update\(\s*\{([^}]+)\}/g
  while ((match = pattern3.exec(content)) !== null) {
    const tableName = match[1]
    const columns = match[2]
    const lineNumber = content.substring(0, match.index).split('\n').length

    queries.push({
      file: filePath,
      line: lineNumber,
      table: tableName,
      rawColumns: columns,
      type: 'update'
    })
  }

  return queries
}

function parseColumns(rawColumns, type) {
  if (type === 'select') {
    // Parse SELECT columns: 'col1, col2, col3'
    return rawColumns
      .split('\n')
      .join(' ')
      .split(',')
      .map(col => {
        // Remove backticks, quotes, and whitespace
        col = col.trim().replace(/[`'"]/g, '')
        // Remove aliases (e.g., "col as alias")
        col = col.split(' as ')[0].trim()
        // Remove nested selections (e.g., "table.col")
        if (col.includes('.')) {
          col = col.split('.').pop()
        }
        // Remove function calls (e.g., "count(*)")
        if (col.includes('(')) {
          return null
        }
        return col
      })
      .filter(col => col && col !== '*' && col.length > 0)
  } else {
    // Parse INSERT/UPDATE columns: { col1: value, col2: value }
    return rawColumns
      .split(',')
      .map(pair => {
        const colonIndex = pair.indexOf(':')
        if (colonIndex === -1) return null
        const col = pair.substring(0, colonIndex).trim()
        return col
      })
      .filter(Boolean)
  }
}

function validateQuery(query, schema) {
  const tableSchema = schema[query.table]

  if (!tableSchema) {
    return {
      valid: false,
      error: `Table '${query.table}' not found in schema`,
      type: 'missing_table'
    }
  }

  if (!tableSchema.columns || tableSchema.columns.length === 0) {
    return {
      valid: false,
      error: `Table '${query.table}' has no columns in schema`,
      type: 'empty_schema'
    }
  }

  const availableColumns = tableSchema.columns.map(col => col.column_name)
  const queriedColumns = parseColumns(query.rawColumns, query.type)

  const invalidColumns = queriedColumns.filter(
    col => !availableColumns.includes(col)
  )

  if (invalidColumns.length > 0) {
    return {
      valid: false,
      error: `Invalid columns: ${invalidColumns.join(', ')}`,
      invalidColumns,
      availableColumns,
      type: 'invalid_columns'
    }
  }

  return { valid: true }
}

async function main() {
  console.log(`${colors.blue}🔍 Validating database column references...${colors.reset}\n`)

  // Load schema
  const schema = loadSchema()
  console.log(`${colors.green}✓${colors.reset} Loaded schema for ${Object.keys(schema).length} tables\n`)

  // Find all TypeScript/JavaScript files
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: SRC_DIR,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'],
    absolute: true
  })

  console.log(`${colors.gray}Scanning ${files.length} files...${colors.reset}\n`)

  let totalQueries = 0
  let validQueries = 0
  let invalidQueries = 0
  const errors = []

  // Scan each file
  for (const file of files) {
    const queries = findSupabaseQueries(file)
    totalQueries += queries.length

    for (const query of queries) {
      const validation = validateQuery(query, schema)

      if (validation.valid) {
        validQueries++
      } else {
        invalidQueries++
        errors.push({
          file: path.relative(process.cwd(), query.file),
          line: query.line,
          table: query.table,
          type: query.type,
          ...validation
        })
      }
    }
  }

  // Report results
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`)

  if (errors.length === 0) {
    console.log(`${colors.green}✅ All ${totalQueries} database queries are valid!${colors.reset}\n`)
    console.log(`${colors.green}✓${colors.reset} ${validQueries} valid queries`)
    console.log(`${colors.green}✓${colors.reset} 0 errors found\n`)
    process.exit(0)
  }

  // Display errors
  console.log(`${colors.red}❌ Found ${errors.length} validation errors in ${totalQueries} queries${colors.reset}\n`)

  errors.forEach((error, index) => {
    console.log(`${colors.red}${index + 1}.${colors.reset} ${colors.yellow}${error.file}:${error.line}${colors.reset}`)
    console.log(`   Table: ${colors.blue}${error.table}${colors.reset}`)
    console.log(`   Type: ${error.type.toUpperCase()}`)
    console.log(`   ${colors.red}Error: ${error.error}${colors.reset}`)

    if (error.invalidColumns) {
      console.log(`\n   ${colors.red}Invalid columns:${colors.reset}`)
      error.invalidColumns.forEach(col => {
        console.log(`     - ${colors.red}${col}${colors.reset}`)
      })

      console.log(`\n   ${colors.green}Available columns:${colors.reset}`)
      error.availableColumns.slice(0, 10).forEach(col => {
        console.log(`     - ${colors.gray}${col}${colors.reset}`)
      })
      if (error.availableColumns.length > 10) {
        console.log(`     ... and ${error.availableColumns.length - 10} more`)
      }
    }

    console.log('')
  })

  console.log(`${colors.yellow}💡 To fix these errors:${colors.reset}`)
  console.log(`   1. Check the database schema: docs/database-schema.md`)
  console.log(`   2. Update your queries to use valid column names`)
  console.log(`   3. Re-run: npm run validate-schema\n`)

  process.exit(1)
}

main()
