/**
 * Test Invoice Tracker API directly to see what data structure we get
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const INVOICE_TRACKER_URL = process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com';
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL;
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD;

async function getAuthToken() {
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

async function main() {
  console.log('=== TESTING INVOICE TRACKER API DIRECTLY ===\n');
  console.log(`URL: ${INVOICE_TRACKER_URL}`);
  console.log(`Email: ${INVOICE_TRACKER_EMAIL}`);
  console.log('');

  try {
    // Get auth token
    const token = await getAuthToken();
    console.log('✅ Authentication successful\n');

    // Fetch aging report
    const response = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Aging report failed: ${response.status}`);
    }

    const agingReport = await response.json();
    console.log(`Generated at: ${agingReport.generatedAt}\n`);

    // Calculate totals from buckets
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

    const clientMap = {};
    Object.entries(agingReport.buckets || {}).forEach(([bucket, data]) => {
      const field = bucketMapping[bucket];
      if (!field || !data.clients) return;

      Object.entries(data.clients).forEach(([clientName, clientData]) => {
        if (!clientMap[clientName]) {
          clientMap[clientName] = {
            client: clientName,
            totalUSD: 0,
            current: 0,
            days31to60: 0,
            days61to90: 0,
            days91to120: 0,
            days121to180: 0,
            days181to270: 0,
            days271to365: 0,
            over365: 0,
          };
        }
        clientMap[clientName][field] = clientData.totalUSD;
        clientMap[clientName].totalUSD += clientData.totalUSD;
      });
    });

    // Exclude non-CSE owned clients
    const excludedClients = ['provation', 'iqht', 'philips', 'altera'];
    const filteredClients = Object.values(clientMap).filter(c => {
      const clientNameLower = c.client.toLowerCase();
      return !excludedClients.some(excluded => clientNameLower.includes(excluded));
    });

    // Calculate totals
    let totalOutstanding = 0;
    let totalCurrent = 0;
    let total31to60 = 0;
    let total61to90 = 0;
    let total90Plus = 0;
    const clientsWithOver90 = [];

    for (const client of filteredClients) {
      totalOutstanding += client.totalUSD;
      totalCurrent += client.current;
      total31to60 += client.days31to60;
      total61to90 += client.days61to90;
      
      const over90 = client.days91to120 + client.days121to180 + 
                     client.days181to270 + client.days271to365 + client.over365;
      total90Plus += over90;
      
      if (over90 > 0) {
        clientsWithOver90.push({
          name: client.client,
          totalOutstanding: client.totalUSD,
          over90Days: over90,
          percentAtRisk: client.totalUSD > 0 ? Math.round((over90 / client.totalUSD) * 100) : 0,
        });
      }
    }

    console.log('=== PORTFOLIO TOTALS (LIVE DATA) ===');
    console.log(`Total Outstanding: $${totalOutstanding.toLocaleString()}`);
    console.log(`Current (0-30): $${totalCurrent.toLocaleString()}`);
    console.log(`31-60 Days: $${total31to60.toLocaleString()}`);
    console.log(`61-90 Days: $${total61to90.toLocaleString()}`);
    console.log(`90+ Days At Risk: $${total90Plus.toLocaleString()}`);
    console.log(`Client Count: ${filteredClients.length}`);
    console.log('');

    console.log('=== TOP 5 CLIENTS AT RISK (90+ DAYS) ===');
    clientsWithOver90
      .sort((a, b) => b.over90Days - a.over90Days)
      .slice(0, 5)
      .forEach(c => {
        console.log(`  ${c.name}: $${c.over90Days.toLocaleString()} (${c.percentAtRisk}% at risk)`);
      });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
