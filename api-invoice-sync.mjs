/**
 * API-Based Invoice Sync
 * Use this if the invoice system provides an API
 *
 * Usage: node scripts/api-invoice-sync.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const INVOICE_API_URL = process.env.INVOICE_API_URL || 'https://invoice.alteraapacai.dev/api'
const INVOICE_API_KEY = process.env.INVOICE_API_KEY

async function fetchFromAPI(endpoint) {
  const url = `${INVOICE_API_URL}${endpoint}`

  console.log(`[API Sync] Fetching: ${url}`)

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${INVOICE_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API request failed: ${response.status} ${error}`)
  }

  return response.json()
}

async function syncInvoices() {
  try {
    console.log('[API Sync] Starting invoice sync...')

    // Fetch invoices from API
    // Adjust endpoint based on actual API structure
    const invoicesData = await fetchFromAPI('/invoices')

    // Handle different response structures
    const invoices = invoicesData.data || invoicesData.invoices || invoicesData

    if (!Array.isArray(invoices)) {
      throw new Error('API did not return an array of invoices')
    }

    console.log(`[API Sync] Found ${invoices.length} invoices from API`)

    // Transform API data to match Supabase schema
    const transformedInvoices = invoices.map(inv => ({
      invoice_id: inv.id || inv.invoice_number || inv.invoiceId,
      client_name: inv.client?.name || inv.clientName || inv.customer,
      client_id: inv.client?.id || inv.clientId,
      amount: parseFloat(inv.total || inv.amount || inv.totalAmount),
      currency: inv.currency || 'AUD',
      status: normalizeStatus(inv.status),
      issue_date: inv.issueDate || inv.date || inv.createdAt,
      due_date: inv.dueDate || inv.paymentDue,
      payment_date: inv.paidDate || inv.paymentDate || null,
      line_items: inv.items || inv.lineItems || [],
      notes: inv.notes || inv.description || '',
      tags: inv.tags || [],
      synced_at: new Date().toISOString()
    }))

    console.log('[API Sync] Transformed invoices:', transformedInvoices.length)

    // Upsert to Supabase
    const { data, error } = await supabase
      .from('invoices')
      .upsert(transformedInvoices, {
        onConflict: 'invoice_id',
        ignoreDuplicates: false
      })

    if (error) {
      console.error('[API Sync] Supabase error:', error)
      throw error
    }

    console.log(`[API Sync] ✓ Successfully synced ${transformedInvoices.length} invoices`)

    // Refresh analytics view
    await supabase.rpc('exec', {
      sql: 'REFRESH MATERIALIZED VIEW invoice_analytics'
    })

    console.log('[API Sync] ✓ Analytics view refreshed')

    // Log sync summary
    const summary = {
      total: transformedInvoices.length,
      byStatus: transformedInvoices.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1
        return acc
      }, {}),
      totalAmount: transformedInvoices.reduce((sum, inv) => sum + inv.amount, 0),
      syncedAt: new Date().toISOString()
    }

    console.log('[API Sync] Summary:', JSON.stringify(summary, null, 2))

    return summary

  } catch (error) {
    console.error('[API Sync] Error:', error)
    throw error
  }
}

// Normalize different status values to standard ones
function normalizeStatus(status) {
  const statusMap = {
    'open': 'pending',
    'unpaid': 'pending',
    'sent': 'pending',
    'paid': 'paid',
    'completed': 'paid',
    'overdue': 'overdue',
    'past_due': 'overdue',
    'late': 'overdue',
    'draft': 'draft',
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'void': 'cancelled',
    'voided': 'cancelled'
  }

  const normalized = statusMap[status?.toLowerCase()] || 'pending'
  return normalized
}

// Run the sync
syncInvoices()
  .then((summary) => {
    console.log('[API Sync] Completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[API Sync] Failed:', error.message)
    process.exit(1)
  })
