/**
 * Sync Invoice Tracker data to aging_accounts database table
 *
 * This script fetches live data from Invoice Tracker and upserts it into
 * the aging_accounts table so that Health Scores, ChaSen AI, and other
 * features have current data.
 *
 * Run: node scripts/sync-invoice-tracker-to-database.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INVOICE_TRACKER_URL = process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com';
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL;
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD;

// Invoice types to EXCLUDE (not Net Revenue)
const EXCLUDED_INVOICE_TYPES = ['Credit Memo', 'Vendor Invoice', 'Purchase Order'];

// Clients to exclude (non-CSE owned)
const EXCLUDED_CLIENTS = ['provation', 'iqht', 'philips', 'altera'];

/**
 * Authenticate with Invoice Tracker
 */
async function getAuthToken() {
  if (!INVOICE_TRACKER_EMAIL || !INVOICE_TRACKER_PASSWORD) {
    throw new Error('Missing INVOICE_TRACKER_EMAIL or INVOICE_TRACKER_PASSWORD');
  }

  const response = await fetch(`${INVOICE_TRACKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: INVOICE_TRACKER_EMAIL,
      password: INVOICE_TRACKER_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

/**
 * Get excluded invoice numbers (Credit Memos, etc.)
 */
async function getExcludedInvoiceNumbers(token) {
  try {
    const response = await fetch(`${INVOICE_TRACKER_URL}/api/invoices`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('Could not fetch invoices for type filtering');
      return new Set();
    }

    const invoices = await response.json();
    const excluded = new Set();

    invoices.forEach(inv => {
      if (EXCLUDED_INVOICE_TYPES.includes(inv.invoiceType) ||
          inv.amountDue < 0 ||
          inv.amountDue === 0) {
        excluded.add(inv.invoiceNumber);
      }
    });

    console.log(`Excluding ${excluded.size} invoices (Credit Memos, Vendor Invoices, etc.)`);
    return excluded;
  } catch (error) {
    console.warn('Error fetching invoice types:', error.message);
    return new Set();
  }
}

/**
 * Normalise client name for matching
 */
function normaliseClientName(name) {
  return name
    .toLowerCase()
    .replace(/\s+(pte|pty|ltd|inc|corp|limited|hospital|health|medical|centre|center)\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Find CSE assignment for a client
 */
function findCSEForClient(clientName, assignments) {
  const exact = assignments.find(
    a => a.client_name_normalized.toLowerCase() === clientName.toLowerCase()
  );
  if (exact) return exact.cse_name;

  const normalised = normaliseClientName(clientName);
  const fuzzy = assignments.find(a => normaliseClientName(a.client_name_normalized) === normalised);
  if (fuzzy) return fuzzy.cse_name;

  const partial = assignments.find(
    a =>
      clientName.toLowerCase().includes(a.client_name_normalized.toLowerCase()) ||
      a.client_name_normalized.toLowerCase().includes(clientName.toLowerCase())
  );
  if (partial) return partial.cse_name;

  return 'Unassigned';
}

/**
 * Main sync function
 */
async function syncInvoiceTrackerToDatabase() {
  console.log('=== Syncing Invoice Tracker to Database ===\n');
  console.log('URL:', INVOICE_TRACKER_URL);

  // Step 1: Authenticate
  console.log('\n1. Authenticating with Invoice Tracker...');
  const token = await getAuthToken();
  console.log('   ✅ Authenticated');

  // Step 2: Fetch aging report
  console.log('\n2. Fetching aging report...');
  const agingResponse = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!agingResponse.ok) {
    throw new Error(`Failed to fetch aging report: ${agingResponse.status}`);
  }

  const agingReport = await agingResponse.json();
  console.log('   ✅ Received aging report, generated:', agingReport.generatedAt);

  // Step 3: Get excluded invoices
  console.log('\n3. Getting excluded invoice types...');
  const excludedInvoiceNumbers = await getExcludedInvoiceNumbers(token);

  // Step 4: Get CSE assignments
  console.log('\n4. Fetching CSE assignments...');
  const { data: assignments, error: assignmentError } = await supabase
    .from('cse_client_assignments')
    .select('cse_name, client_name, client_name_normalized')
    .eq('is_active', true);

  if (assignmentError) {
    throw new Error(`Failed to fetch CSE assignments: ${assignmentError.message}`);
  }
  console.log(`   ✅ Found ${assignments.length} CSE assignments`);

  // Step 5: Process aging data
  console.log('\n5. Processing aging data...');
  const clientMap = {};
  const bucketMapping = {
    'Current': 'current',
    '31-60': 'days31to60',
    '61-90': 'days61to90',
    '91-120': 'days91to120',
    '121-180': 'days121to180',
    '181-270': 'days181to270',
    '271-365': 'days271to365',
    '>365': 'over365',
  };

  Object.entries(agingReport.buckets || {}).forEach(([bucket, data]) => {
    const field = bucketMapping[bucket];
    if (!field || !data.clients) return;

    Object.entries(data.clients).forEach(([clientName, clientData]) => {
      // Skip excluded clients
      const clientNameLower = clientName.toLowerCase();
      if (EXCLUDED_CLIENTS.some(excluded => clientNameLower.includes(excluded))) {
        return;
      }

      if (!clientMap[clientName]) {
        clientMap[clientName] = {
          client: clientName,
          totalUSD: 0,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days91to120: 0,
          days121to180: 0,
          days181to270: 0,
          days271to365: 0,
          over365: 0,
          invoiceCount: 0,
        };
      }

      // Filter out excluded invoices
      const netRevenueInvoices = clientData.invoices?.filter(
        inv => inv.amountDue > 0 && !excludedInvoiceNumbers.has(inv.invoiceNumber)
      ) || [];
      const netRevenueTotal = netRevenueInvoices.reduce((sum, inv) => sum + inv.amountUSD, 0);

      clientMap[clientName][field] = netRevenueTotal;
      clientMap[clientName].totalUSD += netRevenueTotal;
      clientMap[clientName].invoiceCount += netRevenueInvoices.length;
    });
  });

  // Step 6: Prepare database records
  console.log('\n6. Preparing database records...');
  const now = new Date().toISOString();
  const records = [];

  Object.values(clientMap).forEach(client => {
    if (client.totalUSD <= 0) return; // Skip clients with no outstanding

    const cseName = findCSEForClient(client.client, assignments);

    records.push({
      cse_name: cseName,
      client_name: client.client,
      client_name_normalized: client.client,
      most_recent_comment: '',
      current_amount: Math.round(client.current * 100) / 100,
      days_1_to_30: Math.round(client.days1to30),
      days_31_to_60: Math.round(client.days31to60),
      days_61_to_90: Math.round(client.days61to90),
      days_91_to_120: Math.round(client.days91to120),
      days_121_to_180: Math.round(client.days121to180),
      days_181_to_270: Math.round(client.days181to270),
      days_271_to_365: Math.round(client.days271to365),
      days_over_365: Math.round(client.over365),
      total_outstanding: Math.round(client.totalUSD * 100) / 100,
      // Note: total_overdue is a generated column - don't insert
      is_inactive: false,
      data_source: 'invoice_tracker_api',
      import_date: now.split('T')[0],
      week_ending_date: now.split('T')[0],
      created_at: now,
      updated_at: now,
    });
  });

  console.log(`   ✅ Prepared ${records.length} records`);

  // Step 7: Delete old records and insert new ones
  console.log('\n7. Updating database...');

  // Delete all existing records
  const { error: deleteError } = await supabase
    .from('aging_accounts')
    .delete()
    .neq('id', 0); // Delete all

  if (deleteError) {
    throw new Error(`Failed to delete old records: ${deleteError.message}`);
  }
  console.log('   ✅ Deleted old records');

  // Insert new records
  const { data: inserted, error: insertError } = await supabase
    .from('aging_accounts')
    .insert(records)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert records: ${insertError.message}`);
  }
  console.log(`   ✅ Inserted ${inserted.length} records`);

  // Step 8: Summary
  console.log('\n=== Sync Complete ===\n');
  const totalOutstanding = records.reduce((sum, r) => sum + r.total_outstanding, 0);
  const cseCounts = {};
  records.forEach(r => { cseCounts[r.cse_name] = (cseCounts[r.cse_name] || 0) + 1; });

  console.log('Summary:');
  console.log(`  - Clients synced: ${records.length}`);
  console.log(`  - Total outstanding: $${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  - Data source: invoice_tracker_api`);
  console.log(`  - Sync date: ${now}`);
  console.log('\nBy CSE:');
  Object.entries(cseCounts).sort((a, b) => b[1] - a[1]).forEach(([cse, count]) => {
    console.log(`  - ${cse}: ${count} clients`);
  });
}

syncInvoiceTrackerToDatabase().catch(err => {
  console.error('\n❌ Sync failed:', err.message);
  process.exit(1);
});
