/**
 * Debug Working Capital data discrepancy between dashboard and EVP email
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== DEBUGGING WORKING CAPITAL DATA ===\n');

  // Get all aging accounts
  const { data: agingAccounts, error } = await supabase
    .from('aging_accounts')
    .select('*')
    .order('total_outstanding', { ascending: false });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log(`Total records in aging_accounts: ${agingAccounts.length}\n`);

  // Calculate totals like the dashboard does
  let dashboardTotal = 0;
  let dashboardCurrent = 0;
  let dashboard31_60 = 0;
  let dashboard61_90 = 0;
  let dashboardOver90 = 0;

  // Calculate totals like the EVP email does
  let emailTotal = 0;
  let emailAtRisk = 0;

  console.log('=== PER-CLIENT BREAKDOWN ===\n');
  
  for (const acc of agingAccounts) {
    const outstanding = Number(acc.total_outstanding) || 0;
    const current = Number(acc.days_0_to_30) || 0;
    const d31_60 = Number(acc.days_31_to_60) || 0;
    const d61_90 = Number(acc.days_61_to_90) || 0;
    const d91_120 = Number(acc.days_91_to_120) || 0;
    const d121_180 = Number(acc.days_121_to_180) || 0;
    const d181_270 = Number(acc.days_181_to_270) || 0;
    const d271_365 = Number(acc.days_271_to_365) || 0;
    const dOver365 = Number(acc.days_over_365) || 0;

    // Dashboard calculation (sum of all buckets)
    dashboardTotal += outstanding;
    dashboardCurrent += current;
    dashboard31_60 += d31_60;
    dashboard61_90 += d61_90;
    dashboardOver90 += d91_120 + d121_180 + d181_270 + d271_365 + dOver365;

    // EVP email calculation (same but different total?)
    emailTotal += outstanding;
    const over90 = d91_120 + d121_180 + d181_270 + d271_365 + dOver365;
    emailAtRisk += over90;

    if (outstanding > 0) {
      console.log(`${acc.client_name}:`);
      console.log(`  Total Outstanding: $${outstanding.toLocaleString()}`);
      console.log(`  0-30: $${current.toLocaleString()}`);
      console.log(`  31-60: $${d31_60.toLocaleString()}`);
      console.log(`  61-90: $${d61_90.toLocaleString()}`);
      console.log(`  91-120: $${d91_120.toLocaleString()}`);
      console.log(`  121-180: $${d121_180.toLocaleString()}`);
      console.log(`  181-270: $${d181_270.toLocaleString()}`);
      console.log(`  271-365: $${d271_365.toLocaleString()}`);
      console.log(`  Over 365: $${dOver365.toLocaleString()}`);
      console.log(`  90+ Total: $${over90.toLocaleString()}`);
      console.log('');
    }
  }

  console.log('=== TOTALS COMPARISON ===\n');
  console.log('Dashboard should show:');
  console.log(`  Total Outstanding: $${dashboardTotal.toLocaleString()}`);
  console.log(`  Current (0-30): $${dashboardCurrent.toLocaleString()}`);
  console.log(`  31-60 Days: $${dashboard31_60.toLocaleString()}`);
  console.log(`  61-90 Days: $${dashboard61_90.toLocaleString()}`);
  console.log(`  Over 90 Days: $${dashboardOver90.toLocaleString()}`);
  console.log('');
  console.log('EVP Email shows:');
  console.log(`  Total Outstanding: $${emailTotal.toLocaleString()}`);
  console.log(`  At Risk (90+ Days): $${emailAtRisk.toLocaleString()}`);
  console.log('');
  
  // Check what dashboard screenshot shows
  console.log('Dashboard screenshot shows:');
  console.log('  Total Outstanding: $3,015,260');
  console.log('  Current (0-30): $2,466,889');
  console.log('  31-60 Days: $260,462');
  console.log('  61-90 Days: $155,750');
  console.log('  Over 90 Days: $132,159');
  console.log('');
  console.log('EVP Email screenshot shows:');
  console.log('  Total Outstanding: $1,802,693');
  console.log('  At Risk (90+ Days): $259,322');
}

main().catch(console.error);
