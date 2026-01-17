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
  'wa health': 'wa health',
  'minister for health aka south australia health': 'sa health',
  'sa health (ipro)': 'sa health',
  'sa health (sunrise)': 'sa health',
  'strategic asia pacific partners, incorporated': 'grmc',
  'guam regional medical city (grmc)': 'grmc',
  'barwon health australia': 'barwon health',
  'barwon health': 'barwon health',
  'mount alvernia hospital': 'mount alvernia',
  'gippsland health alliance (gha)': 'gha',
  'gippsland health alliance': 'gha',
  'albury wodonga health': 'awh',
}

function normalise(name) {
  if (!name) return ''
  const lower = name.toLowerCase().trim()
  return CLIENT_NORMALISATION[lower] || lower
}

async function compare() {
  console.log('=== COMPARING OPPORTUNITIES BY CLIENT ===\n')

  // Get unmatched sales opportunities
  const { data: sales } = await supabase
    .from('sales_pipeline_opportunities')
    .select('account_name, opportunity_name, total_acv, oracle_quote_number')
    .eq('burc_matched', false)

  // Get all BURC opportunities
  const { data: burc } = await supabase
    .from('pipeline_opportunities')
    .select('client_name, opportunity_name, acv, oracle_agreement_number')

  // Group by normalised client
  const salesByClient = {}
  const burcByClient = {}

  for (const s of sales || []) {
    const norm = normalise(s.account_name)
    if (salesByClient[norm] === undefined) salesByClient[norm] = []
    salesByClient[norm].push(s)
  }

  for (const b of burc || []) {
    const norm = normalise(b.client_name)
    if (burcByClient[norm] === undefined) burcByClient[norm] = []
    burcByClient[norm].push(b)
  }

  // Find clients with opportunities in both systems
  const allClients = new Set([...Object.keys(salesByClient), ...Object.keys(burcByClient)])

  for (const client of allClients) {
    const salesOpps = salesByClient[client] || []
    const burcOpps = burcByClient[client] || []

    if (salesOpps.length > 0 && burcOpps.length > 0) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`CLIENT: ${client.toUpperCase()}`)
      console.log(`${'='.repeat(60)}`)
      console.log(`\nSales Budget (${salesOpps.length} unmatched):`)
      salesOpps.slice(0, 5).forEach(s => {
        console.log(`  • ${s.opportunity_name?.substring(0, 60)}`)
        console.log(`    ACV: $${s.total_acv?.toLocaleString() || 0}, Oracle: ${s.oracle_quote_number || 'none'}`)
      })
      if (salesOpps.length > 5) console.log(`  ... and ${salesOpps.length - 5} more`)

      console.log(`\nBURC Pipeline (${burcOpps.length} entries):`)
      burcOpps.slice(0, 5).forEach(b => {
        console.log(`  • ${b.opportunity_name?.substring(0, 60)}`)
        console.log(`    ACV: $${b.acv?.toLocaleString() || 0}, Oracle: ${b.oracle_agreement_number || 'none'}`)
      })
      if (burcOpps.length > 5) console.log(`  ... and ${burcOpps.length - 5} more`)
    }
  }

  // Find clients with only Sales Budget opportunities (no BURC)
  console.log(`\n\n${'='.repeat(60)}`)
  console.log('CLIENTS WITH SALES BUDGET ONLY (NO BURC ENTRIES)')
  console.log(`${'='.repeat(60)}`)

  for (const client of Object.keys(salesByClient)) {
    if (!burcByClient[client] || burcByClient[client].length === 0) {
      const opps = salesByClient[client]
      const totalAcv = opps.reduce((sum, o) => sum + (o.total_acv || 0), 0)
      console.log(`  • ${client}: ${opps.length} opps, $${(totalAcv / 1000).toFixed(0)}k ACV`)
    }
  }
}

compare().catch(console.error)
