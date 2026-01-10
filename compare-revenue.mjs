import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config({ path: '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/CS Connect Meetings/Sandbox/apac-intelligence-v2/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Query database
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, fiscal_year, amount_usd');

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Aggregate by client
  const dbClientTotals = {};
  for (const row of data) {
    const client = row.client_name;
    if (!dbClientTotals[client]) {
      dbClientTotals[client] = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0, total: 0 };
    }
    const year = row.fiscal_year;
    const amount = parseFloat(row.amount_usd) || 0;
    if (dbClientTotals[client][year] !== undefined) {
      dbClientTotals[client][year] += amount;
    }
    dbClientTotals[client].total += amount;
  }

  // Read Excel file
  const excelPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/APAC Revenue 2019 - 2024.xlsx';
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets['Customer Level Summary'];
  const excelData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Parse Excel data
  const revenueTypes = [
    'Hardware & Other Revenue',
    'License Revenue',
    'Maintenance Revenue',
    'Professional Services Revenue'
  ];

  const yearCols = { 2019: 3, 2020: 4, 2021: 5, 2022: 6, 2023: 7, 2024: 8 };
  const excelClientTotals = {};

  let currentCustomer = '';
  for (let i = 2; i < excelData.length; i++) {
    const row = excelData[i];
    if (row?.[1]) {
      currentCustomer = row[1];
    }

    const rollup = row?.[2];
    if (rollup && revenueTypes.includes(rollup) && currentCustomer) {
      if (!excelClientTotals[currentCustomer]) {
        excelClientTotals[currentCustomer] = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0, total: 0 };
      }

      for (const [year, col] of Object.entries(yearCols)) {
        const val = parseFloat(row[col]) || 0;
        excelClientTotals[currentCustomer][year] += val;
        excelClientTotals[currentCustomer].total += val;
      }
    }
  }

  // Compare
  console.log('=== COMPARISON: Excel vs Database (2024 Revenue) ===\n');
  console.log('Client'.padEnd(48) + '| Excel 2024 | DB 2024   | Gap');
  console.log('-'.repeat(85));

  const excelClients = Object.entries(excelClientTotals)
    .sort((a, b) => b[1].total - a[1].total);

  let totalExcel2024 = 0;
  let totalDb2024 = 0;

  for (const [excelClient, excelYears] of excelClients) {
    // Try to find matching DB client
    const dbMatch = Object.entries(dbClientTotals).find(([dbClient]) => {
      return dbClient.toLowerCase().includes(excelClient.toLowerCase().substring(0, 15)) ||
             excelClient.toLowerCase().includes(dbClient.toLowerCase().substring(0, 15));
    });

    const excelVal = excelYears[2024];
    const dbVal = dbMatch ? dbMatch[1][2024] : 0;
    const gap = excelVal - dbVal;

    totalExcel2024 += excelVal;
    totalDb2024 += dbVal;

    console.log(`${excelClient.substring(0, 47).padEnd(48)}| $${(excelVal/1e6).toFixed(2).padStart(6)}M | $${(dbVal/1e6).toFixed(2).padStart(6)}M | $${(gap/1e6).toFixed(2)}M`);
  }

  console.log('-'.repeat(85));
  console.log(`${'TOTALS'.padEnd(48)}| $${(totalExcel2024/1e6).toFixed(2).padStart(6)}M | $${(totalDb2024/1e6).toFixed(2).padStart(6)}M | $${((totalExcel2024-totalDb2024)/1e6).toFixed(2)}M`);

  console.log('\n=== DATABASE CLIENTS NOT IN EXCEL ===');
  for (const [dbClient, dbYears] of Object.entries(dbClientTotals)) {
    const inExcel = Object.keys(excelClientTotals).some(ec =>
      ec.toLowerCase().includes(dbClient.toLowerCase().substring(0, 10)) ||
      dbClient.toLowerCase().includes(ec.toLowerCase().substring(0, 10))
    );
    if (!inExcel && dbYears.total > 100000) {
      console.log(`${dbClient}: $${(dbYears.total/1e6).toFixed(2)}M total, $${(dbYears[2024]/1e6).toFixed(2)}M in 2024`);
    }
  }
}

run();
