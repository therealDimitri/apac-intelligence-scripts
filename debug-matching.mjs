#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CLIENT_NORMALISATION = {
  'western australia department of health': 'wa health',
  'wa department of health': 'wa health',
  'department of health wa': 'wa health',
  'wa health': 'wa health',
  'minister for health aka south australia health': 'sa health',
  'south australia health': 'sa health',
  'sa health (ipro)': 'sa health',
  'sa health (iqemo)': 'sa health',
  'sa health (sunrise)': 'sa health',
  'sa health': 'sa health',
  'strategic asia pacific partners, incorporated': 'grmc',
  'strategic asia pacific partners incorporated': 'grmc',
  'guam regional medical city (grmc)': 'grmc',
  'guam regional medical city': 'grmc',
  'grmc': 'grmc',
  'barwon health australia': 'barwon health',
  'barwon health': 'barwon health',
  'mount alvernia hospital': 'mount alvernia',
  'mah': 'mount alvernia',
  'albury wodonga health': 'awh',
  'awh': 'awh',
  'gippsland health alliance (gha)': 'gha',
  'gippsland health alliance': 'gha',
  'gha': 'gha',
}

function normaliseClientName(name) {
  if (!name) return ''
  const lower = name.toLowerCase().trim()
  return CLIENT_NORMALISATION[lower] || lower
}

async function debug() {
  console.log('=== DEBUG MATCHING ===\n')

  // Get some unmatched sales opportunities
  const { data: sales } = await supabase
    .from('sales_pipeline_opportunities')
    .select('account_name, opportunity_name')
    .eq('burc_matched', false)
    .limit(10)

  // Get all BURC pipeline
  const { data: burc } = await supabase
    .from('pipeline_opportunities')
    .select('client_name, opportunity_name')

  console.log('BURC clients and their normalised names:')
  const burcNormalised = new Map()
  const seenClients = new Set()
  for (const b of burc || []) {
    if (seenClients.has(b.client_name)) continue
    seenClients.add(b.client_name)
    const norm = normaliseClientName(b.client_name)
    burcNormalised.set(norm, b.client_name)
    console.log(`  "${b.client_name}" → "${norm}"`)
  }

  console.log('\n\nSales opportunities and matching attempt:')
  for (const s of sales || []) {
    const salesNorm = normaliseClientName(s.account_name)
    const matchingBurcOriginal = burcNormalised.get(salesNorm)

    console.log(`\n  Sales: "${s.account_name}"`)
    console.log(`  Normalised: "${salesNorm}"`)
    if (matchingBurcOriginal) {
      console.log(`  ✅ FOUND MATCH: "${matchingBurcOriginal}"`)
    } else {
      console.log(`  ❌ NO MATCH in BURC`)
    }
  }
}

debug().catch(console.error)
