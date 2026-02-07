#!/usr/bin/env node
/**
 * Enrich Sales Hub Content with AI
 * Updates existing product_catalog entries with AI-extracted content
 *
 * Run from project root: node scripts/enrich-sales-hub-content.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
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

// MatchaAI configuration (correct format)
const MATCHAAI_CONFIG = {
  apiKey: process.env.MATCHAAI_API_KEY,
  baseUrl: process.env.MATCHAAI_BASE_URL || 'https://matcha.harriscomputer.com/rest/api/v1',
  missionId: process.env.MATCHAAI_MISSION_ID || '1397',
  defaultModel: process.env.MATCHAAI_DEFAULT_MODEL || 'claude-sonnet-4-5',
}

// Path mappings
const LOCAL_BASE = `${MARKETING}/Altera Content`
const SHAREPOINT_BASE = 'https://alteradh.sharepoint.com/sites/Marketing/Shared%20Documents/Marketing%20Collateral/Altera%20Content'

/**
 * Convert SharePoint URL back to local path for reading
 */
function toLocalPath(sharePointUrl) {
  const relativePath = decodeURIComponent(sharePointUrl.replace(SHAREPOINT_BASE, ''))
  return LOCAL_BASE + relativePath
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

// Model mapping for MatchaAI
const MODEL_MAP = {
  'claude-sonnet-4-5': { id: 28, name: 'Claude Sonnet 4.5' },
  'claude-sonnet-4': { id: 28, name: 'Claude Sonnet 4' },
  'gemini-2-flash': { id: 71, name: 'Gemini 2.0 Flash' },
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

  const modelConfig = MODEL_MAP[MATCHAAI_CONFIG.defaultModel] || MODEL_MAP['claude-sonnet-4-5']

  try {
    const response = await fetch(`${MATCHAAI_CONFIG.baseUrl}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MATCHA-API-KEY': MATCHAAI_CONFIG.apiKey,
      },
      body: JSON.stringify({
        mission_id: parseInt(MATCHAAI_CONFIG.missionId),
        llm_id: modelConfig.id,
        messages: [
          {
            role: 'system',
            content: 'You are a sales content extraction assistant. Extract structured data from sales documents and return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`MatchaAI error ${response.status}: ${errorText.substring(0, 200)}`)
    }

    const data = await response.json()

    // Handle MatchaAI response format
    let content = ''
    if (data.output?.[0]?.content?.[0]?.text) {
      content = data.output[0].content[0].text
    } else if (data.output?.[0]?.message?.content) {
      content = data.output[0].message.content
    } else if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content
    }

    if (!content) {
      console.error(`  ⚠️  Empty AI response:`, JSON.stringify(data).substring(0, 500))
      return {}
    }

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
 * Enrich a single product with AI-extracted content
 */
async function enrichProduct(product) {
  console.log(`  📄 ${product.asset_filename}`)

  // Check if already enriched (has elevator_pitch)
  if (product.elevator_pitch) {
    console.log(`     ⏭️  Already enriched`)
    return { skipped: true }
  }

  // Convert SharePoint URL to local path
  const localPath = toLocalPath(product.asset_url)

  if (!fs.existsSync(localPath)) {
    console.log(`     ⚠️  File not found: ${localPath}`)
    return { error: 'File not found' }
  }

  // Read PDF text
  const pdfText = await readPdfText(localPath)
  if (!pdfText) {
    console.log(`     ⚠️  Could not extract text`)
    return { error: 'Could not extract text' }
  }

  // Extract structured content with AI
  const extracted = await extractWithAI(pdfText, product.asset_filename, product.content_type)

  if (!extracted.elevator_pitch) {
    console.log(`     ⚠️  AI extraction returned empty`)
    return { error: 'AI extraction empty' }
  }

  // Update product record
  const { error } = await supabase
    .from('product_catalog')
    .update({
      elevator_pitch: extracted.elevator_pitch,
      solution_overview: extracted.solution_overview,
      value_propositions: extracted.value_propositions || [],
      key_drivers: extracted.key_drivers || [],
      target_triggers: extracted.target_triggers || [],
      competitive_analysis: extracted.competitive_analysis || [],
      objection_handling: extracted.objection_handling || [],
      faq: extracted.faq || [],
      pricing_summary: extracted.pricing_summary,
      version_requirements: extracted.version_requirements,
    })
    .eq('id', product.id)

  if (error) {
    console.log(`     ❌ Update failed: ${error.message}`)
    return { error: error.message }
  }

  console.log(`     ✅ Enriched`)
  return { success: true }
}

/**
 * Main enrichment function
 */
async function main() {
  console.log('🧠 Sales Hub Content Enrichment\n')

  // Get all products without elevator_pitch
  const { data: products, error } = await supabase
    .from('product_catalog')
    .select('*')
    .is('elevator_pitch', null)
    .order('content_type')

  if (error) {
    console.error('Failed to fetch products:', error.message)
    process.exit(1)
  }

  console.log(`Found ${products.length} products to enrich\n`)

  const stats = { enriched: 0, skipped: 0, errors: 0 }

  for (const product of products) {
    const result = await enrichProduct(product)
    if (result.success) stats.enriched++
    else if (result.skipped) stats.skipped++
    else stats.errors++

    // Rate limiting - 1 request per 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log('\n' + '═'.repeat(50))
  console.log('📊 ENRICHMENT SUMMARY')
  console.log('═'.repeat(50))
  console.log(`Total:    ${products.length}`)
  console.log(`Enriched: ${stats.enriched}`)
  console.log(`Skipped:  ${stats.skipped}`)
  console.log(`Errors:   ${stats.errors}`)
  console.log('═'.repeat(50))
}

main().catch(console.error)
