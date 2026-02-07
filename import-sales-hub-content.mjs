#!/usr/bin/env node
/**
 * Import Sales Hub Content
 * Reads PDFs from OneDrive, extracts content via MatchaAI, and imports to database
 *
 * Run from project root: node scripts/import-sales-hub-content.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'
import { createRequire } from 'module'
import fs from 'fs'
import { MARKETING, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// MatchaAI configuration
const MATCHAAI_BASE_URL = process.env.MATCHAAI_BASE_URL
const MATCHAAI_API_KEY = process.env.MATCHAAI_API_KEY
const MATCHAAI_MISSION_ID = process.env.MATCHAAI_MISSION_ID

// Path mappings
const LOCAL_BASE = `${MARKETING}/Altera Content`
const SHAREPOINT_BASE = 'https://alteradh.sharepoint.com/sites/Marketing/Shared%20Documents/Marketing%20Collateral/Altera%20Content'

// Content type folders
const CONTENT_FOLDERS = {
  'sales_brief': 'Sales Brief',
  'brochure': 'Brochure',
  'datasheet': 'Datasheet',
  'door_opener': 'Door-Openers',
  'one_pager': 'One-Pagers',
  'toolkit': 'Toolkits',
  'video': 'Video'
}

/**
 * Convert local file path to SharePoint URL
 */
function toSharePointUrl(localPath) {
  const relativePath = localPath.replace(LOCAL_BASE, '')
  const encodedPath = relativePath
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return SHAREPOINT_BASE + encodedPath
}

/**
 * Extract product family from filename/content
 */
function extractProductFamily(filename, content = '') {
  const families = [
    'Sunrise', 'Paragon', 'TouchWorks', 'dbMotion', 'FollowMyHealth',
    'Provation', 'EPSi', 'STAR', 'Strata', 'Veradigm', 'Ventus',
    'Altera Cloud', 'Managed Services'
  ]

  for (const family of families) {
    if (filename.toLowerCase().includes(family.toLowerCase())) {
      return family
    }
  }

  // Check content if filename doesn't reveal it
  for (const family of families) {
    if (content.toLowerCase().includes(family.toLowerCase())) {
      return family
    }
  }

  return 'Other'
}

/**
 * Extract product name from filename
 */
function extractProductName(filename) {
  // Remove common suffixes
  let name = filename
    .replace(/\.pdf$/i, '')
    .replace(/ Sales Brief$/i, '')
    .replace(/ Datasheet$/i, '')
    .replace(/ Brochure$/i, '')
    .replace(/ Door[- ]?Opener$/i, '')
    .replace(/ One[- ]?Pager$/i, '')
    .replace(/ Toolkit.*$/i, '')
    .replace(/\s*\(APAC\)$/i, '')
    .replace(/\s*\(US\)$/i, '')
    .replace(/\s*\(UK\)$/i, '')
    .replace(/\s*January \d{4}$/i, '')
    .trim()

  return name
}

/**
 * Detect regions from filename/content
 */
function detectRegions(filename, content = '') {
  const regions = []
  const text = (filename + ' ' + content).toLowerCase()

  if (text.includes('apac') || text.includes('asia') || text.includes('pacific')) {
    regions.push('APAC')
  }
  if (text.includes('anz') || text.includes('australia') || text.includes('new zealand')) {
    regions.push('ANZ')
  }
  if (text.includes('emea') || text.includes('europe')) {
    regions.push('EMEA')
  }
  if (text.includes('uk') || text.includes('united kingdom')) {
    regions.push('UK')
  }
  if (text.includes('canada')) {
    regions.push('Canada')
  }
  if (text.includes('us') || text.includes('united states') || text.includes('america')) {
    regions.push('US')
  }

  // Default to global if no specific region detected
  if (regions.length === 0) {
    regions.push('Global')
  }

  return regions
}

/**
 * Call MatchaAI to extract structured content from PDF text
 */
async function extractWithAI(pdfText, filename, contentType) {
  const prompt = `You are extracting structured sales content from a ${contentType.replace('_', ' ')} document.

Document filename: ${filename}

Document content:
${pdfText.substring(0, 15000)}

Extract the following fields as JSON. Return ONLY valid JSON, no explanation:
{
  "elevator_pitch": "1-2 sentence summary of the product/solution",
  "solution_overview": "Detailed description of what the product does",
  "value_propositions": [{"title": "Value Prop Title", "description": "Explanation"}],
  "key_drivers": [{"title": "Driver Title", "description": "Why customers need this"}],
  "target_triggers": ["When to pitch this product - customer situation or pain point"],
  "competitive_analysis": [{"competitor": "Name", "our_advantage": "What we do better"}],
  "objection_handling": [{"objection": "Common objection", "response": "How to address"}],
  "faq": [{"question": "Frequently asked question", "answer": "Answer"}],
  "pricing_summary": "Brief pricing info if mentioned",
  "version_requirements": "Required software versions if mentioned"
}

If a field has no relevant content, use null for strings or [] for arrays. For value_propositions, key_drivers, competitive_analysis, objection_handling, and faq - extract at least 3 items each if present in the document.`

  try {
    const response = await fetch(`${MATCHAAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MATCHAAI_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Mission-ID': MATCHAAI_MISSION_ID
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      throw new Error(`MatchaAI error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '{}'

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    return {}
  } catch (error) {
    console.error(`  ⚠️  AI extraction failed: ${error.message}`)
    return {}
  }
}

/**
 * Read PDF and extract text
 */
async function readPdfText(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath)
    const parser = new PDFParse({ data: dataBuffer })
    await parser.load()
    const result = await parser.getText()
    return result.text || ''
  } catch (error) {
    console.error(`  ⚠️  Could not read PDF: ${error.message}`)
    return ''
  }
}

/**
 * Import a single product catalog item
 */
async function importProduct(filePath, contentType) {
  const filename = basename(filePath)
  console.log(`  📄 ${filename}`)

  // Check if already imported
  const { data: existing } = await supabase
    .from('product_catalog')
    .select('id')
    .eq('asset_filename', filename)
    .single()

  if (existing) {
    console.log(`     ⏭️  Already imported`)
    return { skipped: true }
  }

  // Read PDF text
  const pdfText = await readPdfText(filePath)
  if (!pdfText) {
    console.log(`     ⚠️  Could not extract text`)
    return { error: 'Could not extract text' }
  }

  // Extract structured content with AI
  const extracted = await extractWithAI(pdfText, filename, contentType)

  // Build product record
  const product = {
    product_family: extractProductFamily(filename, pdfText),
    product_name: extractProductName(filename),
    content_type: contentType,
    regions: detectRegions(filename, pdfText),
    title: extractProductName(filename),
    elevator_pitch: extracted.elevator_pitch || null,
    solution_overview: extracted.solution_overview || null,
    value_propositions: extracted.value_propositions || [],
    key_drivers: extracted.key_drivers || [],
    target_triggers: extracted.target_triggers || [],
    competitive_analysis: extracted.competitive_analysis || [],
    objection_handling: extracted.objection_handling || [],
    faq: extracted.faq || [],
    pricing_summary: extracted.pricing_summary || null,
    version_requirements: extracted.version_requirements || null,
    asset_url: toSharePointUrl(filePath),
    asset_filename: filename,
    is_active: true
  }

  // Insert into database
  const { data, error } = await supabase
    .from('product_catalog')
    .insert(product)
    .select()
    .single()

  if (error) {
    console.log(`     ❌ Insert failed: ${error.message}`)
    return { error: error.message }
  }

  console.log(`     ✅ Imported (${product.product_family})`)
  return { success: true, id: data.id }
}

/**
 * Import a toolkit (creates toolkit + solution bundles)
 */
async function importToolkit(filePath) {
  const filename = basename(filePath)
  console.log(`  📚 ${filename}`)

  // Check if already imported
  const { data: existing } = await supabase
    .from('toolkits')
    .select('id')
    .eq('asset_url', toSharePointUrl(filePath))
    .single()

  if (existing) {
    console.log(`     ⏭️  Already imported`)
    return { skipped: true }
  }

  // Extract version from filename
  const versionMatch = filename.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i)
  const version = versionMatch ? versionMatch[0] : null

  // Extract name (without version and .pdf)
  const name = filename
    .replace(/\.pdf$/i, '')
    .replace(/\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i, '')
    .trim()

  const toolkit = {
    name: name,
    description: `${name} sales toolkit containing solution bundles and sales plays`,
    version: version,
    regions: detectRegions(filename),
    asset_url: toSharePointUrl(filePath),
    is_active: true
  }

  const { data, error } = await supabase
    .from('toolkits')
    .insert(toolkit)
    .select()
    .single()

  if (error) {
    console.log(`     ❌ Insert failed: ${error.message}`)
    return { error: error.message }
  }

  console.log(`     ✅ Imported toolkit`)
  return { success: true, id: data.id }
}

/**
 * Get files to import for a content type
 */
function getFilesForContentType(contentType) {
  const folder = CONTENT_FOLDERS[contentType]
  const folderPath = join(LOCAL_BASE, folder)

  if (!fs.existsSync(folderPath)) {
    return []
  }

  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.pdf'))
    .map(f => join(folderPath, f))

  return files
}

/**
 * Main import function
 */
async function main() {
  console.log('🚀 Sales Hub Content Import\n')

  const stats = {
    sales_brief: { total: 0, imported: 0, skipped: 0, errors: 0 },
    datasheet: { total: 0, imported: 0, skipped: 0, errors: 0 },
    brochure: { total: 0, imported: 0, skipped: 0, errors: 0 },
    door_opener: { total: 0, imported: 0, skipped: 0, errors: 0 },
    one_pager: { total: 0, imported: 0, skipped: 0, errors: 0 },
    toolkit: { total: 0, imported: 0, skipped: 0, errors: 0 }
  }

  // Import Sales Briefs (highest priority)
  console.log('\n📁 SALES BRIEFS')
  const salesBriefs = getFilesForContentType('sales_brief')
  stats.sales_brief.total = salesBriefs.length
  for (const file of salesBriefs) {
    const result = await importProduct(file, 'sales_brief')
    if (result.success) stats.sales_brief.imported++
    else if (result.skipped) stats.sales_brief.skipped++
    else stats.sales_brief.errors++
  }

  // Import Toolkits (high priority)
  console.log('\n📁 TOOLKITS')
  const toolkits = getFilesForContentType('toolkit')
  stats.toolkit.total = toolkits.length
  for (const file of toolkits) {
    const result = await importToolkit(file)
    if (result.success) stats.toolkit.imported++
    else if (result.skipped) stats.toolkit.skipped++
    else stats.toolkit.errors++
  }

  // Import Datasheets
  console.log('\n📁 DATASHEETS')
  const datasheets = getFilesForContentType('datasheet')
  stats.datasheet.total = datasheets.length
  for (const file of datasheets) {
    const result = await importProduct(file, 'datasheet')
    if (result.success) stats.datasheet.imported++
    else if (result.skipped) stats.datasheet.skipped++
    else stats.datasheet.errors++
  }

  // Import Door Openers
  console.log('\n📁 DOOR OPENERS')
  const doorOpeners = getFilesForContentType('door_opener')
  stats.door_opener.total = doorOpeners.length
  for (const file of doorOpeners) {
    const result = await importProduct(file, 'door_opener')
    if (result.success) stats.door_opener.imported++
    else if (result.skipped) stats.door_opener.skipped++
    else stats.door_opener.errors++
  }

  // Import Brochures
  console.log('\n📁 BROCHURES')
  const brochures = getFilesForContentType('brochure')
  stats.brochure.total = brochures.length
  for (const file of brochures) {
    const result = await importProduct(file, 'brochure')
    if (result.success) stats.brochure.imported++
    else if (result.skipped) stats.brochure.skipped++
    else stats.brochure.errors++
  }

  // Import One-Pagers
  console.log('\n📁 ONE-PAGERS')
  const onePagers = getFilesForContentType('one_pager')
  stats.one_pager.total = onePagers.length
  for (const file of onePagers) {
    const result = await importProduct(file, 'one_pager')
    if (result.success) stats.one_pager.imported++
    else if (result.skipped) stats.one_pager.skipped++
    else stats.one_pager.errors++
  }

  // Summary
  console.log('\n' + '═'.repeat(50))
  console.log('📊 IMPORT SUMMARY')
  console.log('═'.repeat(50))

  for (const [type, s] of Object.entries(stats)) {
    if (s.total > 0) {
      console.log(`${type.replace('_', ' ').padEnd(15)} | Total: ${s.total.toString().padStart(3)} | ✅ ${s.imported.toString().padStart(3)} | ⏭️  ${s.skipped.toString().padStart(3)} | ❌ ${s.errors.toString().padStart(3)}`)
    }
  }

  const totalImported = Object.values(stats).reduce((sum, s) => sum + s.imported, 0)
  const totalSkipped = Object.values(stats).reduce((sum, s) => sum + s.skipped, 0)
  const totalErrors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0)

  console.log('─'.repeat(50))
  console.log(`${'TOTAL'.padEnd(15)} |       ${(totalImported + totalSkipped + totalErrors).toString().padStart(3)} | ✅ ${totalImported.toString().padStart(3)} | ⏭️  ${totalSkipped.toString().padStart(3)} | ❌ ${totalErrors.toString().padStart(3)}`)
  console.log('═'.repeat(50))
}

main().catch(console.error)
