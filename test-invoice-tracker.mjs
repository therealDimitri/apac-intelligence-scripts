/**
 * Test Invoice Tracker API to see what data structure we get
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function main() {
  console.log('=== TESTING INVOICE TRACKER API ===\n');
  console.log(`Fetching from: ${BASE_URL}/api/invoice-tracker/aging-by-cse\n`);

  try {
    const response = await fetch(`${BASE_URL}/api/invoice-tracker/aging-by-cse`);
    if (!response.ok) {
      console.log('Error:', response.status, response.statusText);
      const text = await response.text();
      console.log('Response:', text);
      return;
    }

    const data = await response.json();
    
    console.log('=== PORTFOLIO TOTALS ===');
    console.log(`Total USD: $${data.portfolioTotals?.totalUSD?.toLocaleString()}`);
    console.log(`Current: $${data.portfolioTotals?.current?.toLocaleString()}`);
    console.log(`Overdue: $${data.portfolioTotals?.overdue?.toLocaleString()}`);
    console.log(`Client Count: ${data.portfolioTotals?.clientCount}`);
    console.log(`At Risk Clients: ${data.portfolioTotals?.atRiskClients}`);
    console.log('');

    // Calculate 90+ days from clients
    let total90Plus = 0;
    const clientsWithOver90 = [];
    
    for (const cse of data.byCSE || []) {
      for (const client of cse.clients || []) {
        const over90 = (client.days91to120 || 0) + 
                       (client.days121to180 || 0) + 
                       (client.days181to270 || 0) + 
                       (client.days271to365 || 0) + 
                       (client.over365 || 0);
        total90Plus += over90;
        if (over90 > 0) {
          clientsWithOver90.push({
            name: client.client,
            cse: cse.cseName,
            totalOutstanding: client.totalUSD,
            over90Days: over90,
          });
        }
      }
    }

    console.log('=== 90+ DAYS CALCULATION ===');
    console.log(`Total 90+ Days: $${total90Plus.toLocaleString()}`);
    console.log(`Clients with 90+ Days: ${clientsWithOver90.length}`);
    console.log('');

    console.log('=== TOP 5 CLIENTS AT RISK ===');
    clientsWithOver90
      .sort((a, b) => b.over90Days - a.over90Days)
      .slice(0, 5)
      .forEach(c => {
        console.log(`  ${c.name} (${c.cse}): $${c.over90Days.toLocaleString()} at risk`);
      });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
