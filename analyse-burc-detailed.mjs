#!/usr/bin/env node
/**
 * Detailed BURC Analysis Script
 * Extracts key financial data from the 2026 APAC Performance Excel file
 */

import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx';

async function analyseBURC() {
  console.log('📊 Loading BURC file...');
  const workbook = XLSX.readFile(BURC_PATH);

  const analysis = {
    attritionRisks: [],
    waterfallData: [],
    monthlyEBITA: [],
    maintenanceContracts: [],
    businessCases: [],
    revenueByStream: {},
    quarterlyTargets: {}
  };

  // 1. ATTRITION RISKS
  console.log('\n=== 1. ATTRITION RISKS ===');
  const attrition = XLSX.utils.sheet_to_json(workbook.Sheets['Attrition'], { header: 1 });
  attrition.slice(2, 15).forEach(row => {
    if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '') {
      const risk = {
        client: row[0],
        type: row[1] || 'Full',
        forecastDate: row[2],
        revenue2025: row[3] || 0,
        revenue2026: row[4] || 0,
        revenue2027: row[5] || 0,
        revenue2028: row[6] || 0,
        totalAtRisk: row[7] || 0
      };
      if (risk.totalAtRisk > 0 || risk.revenue2026 > 0) {
        analysis.attritionRisks.push(risk);
        console.log(`  ⚠️ ${risk.client} (${risk.type}): $${risk.totalAtRisk}K total at risk`);
        console.log(`     2025: $${risk.revenue2025}K | 2026: $${risk.revenue2026}K | 2027: $${risk.revenue2027}K`);
      }
    }
  });

  // 2. WATERFALL DATA (Financial Drivers)
  console.log('\n=== 2. WATERFALL DATA (Key Financial Drivers) ===');
  const waterfall = XLSX.utils.sheet_to_json(workbook.Sheets['Waterfall Data'], { header: 1 });
  waterfall.slice(1, 20).forEach(row => {
    if (row[0] && row[1]) {
      const driver = {
        name: row[0],
        value: typeof row[1] === 'number' ? row[1] : 0,
        note: row[3] || ''
      };
      analysis.waterfallData.push(driver);
      const valueK = (driver.value / 1000).toFixed(0);
      console.log(`  📈 ${driver.name}: $${valueK}K`);
      if (driver.note) console.log(`     → ${driver.note}`);
    }
  });

  // 3. MONTHLY EBITA
  console.log('\n=== 3. MONTHLY EBITA TARGETS ===');
  const ebita = XLSX.utils.sheet_to_json(workbook.Sheets['APAC BURC - Monthly EBITA'], { header: 1 });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  ebita.slice(0, 15).forEach((row, i) => {
    if (row[0] && row.length > 1) {
      const metric = {
        name: row[0],
        monthly: row.slice(1, 13).map((v, idx) => ({
          month: months[idx],
          value: typeof v === 'number' ? v : 0
        }))
      };
      if (row[0] === 'EBITA') {
        analysis.monthlyEBITA = metric.monthly;
        console.log(`  💰 EBITA by month:`);
        metric.monthly.forEach(m => {
          const valueK = (m.value / 1000).toFixed(0);
          console.log(`     ${m.month}: $${valueK}K`);
        });
      }
    }
  });

  // 4. MAINTENANCE CONTRACTS (Opal)
  console.log('\n=== 4. OPAL MAINTENANCE CONTRACTS ===');
  const opalMaint = XLSX.utils.sheet_to_json(workbook.Sheets['Opal Maint Contracts and Value'], { header: 1 });
  let clientCount = 0;
  opalMaint.forEach((row, i) => {
    if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '' && i > 2) {
      // Look for client rows with contract dates/values
      if (row[1] || row[2] || row[3]) {
        clientCount++;
        console.log(`  📋 ${row[0]}: ${row.slice(1, 7).filter(Boolean).join(' | ')}`);
      }
    }
  });

  // 5. MAINTENANCE REVENUE BY CLIENT
  console.log('\n=== 5. MAINTENANCE REVENUE BY CLIENT ===');
  const maint = XLSX.utils.sheet_to_json(workbook.Sheets['Maint'], { header: 1 });
  const maintClients = new Map();
  maint.forEach((row, i) => {
    if (row[0] && typeof row[0] === 'string' && row[0] !== 'Maint Revenue' && i > 1) {
      // Row format: Client | Type | Monthly values...
      const client = row[0];
      const type = row[1];
      const monthlyTotal = row.slice(2, 14).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      if (monthlyTotal > 0) {
        if (!maintClients.has(client)) {
          maintClients.set(client, { runRate: 0, newBusiness: 0, atRisk: 0 });
        }
        const clientData = maintClients.get(client);
        if (type === 'Run Rate') clientData.runRate += monthlyTotal;
        else if (type === 'New Business') clientData.newBusiness += monthlyTotal;
        else if (type === 'At Risk') clientData.atRisk += monthlyTotal;
      }
    }
  });

  // Sort by total revenue
  const sortedClients = [...maintClients.entries()]
    .map(([client, data]) => ({
      client,
      runRate: data.runRate,
      newBusiness: data.newBusiness,
      atRisk: data.atRisk,
      total: data.runRate + data.newBusiness - data.atRisk
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  sortedClients.forEach(c => {
    console.log(`  💵 ${c.client}: $${(c.total/1000).toFixed(0)}K (Run: $${(c.runRate/1000).toFixed(0)}K, New: $${(c.newBusiness/1000).toFixed(0)}K, Risk: $${(c.atRisk/1000).toFixed(0)}K)`);
  });
  analysis.revenueByStream.maintenance = sortedClients;

  // 6. PS REVENUE BY CLIENT
  console.log('\n=== 6. PROFESSIONAL SERVICES REVENUE ===');
  const ps = XLSX.utils.sheet_to_json(workbook.Sheets['PS'], { header: 1 });
  const psClients = new Map();
  ps.forEach((row, i) => {
    if (row[0] && typeof row[0] === 'string' && row[0] !== 'PS Revenue' && i > 1) {
      const client = row[0];
      const type = row[1];
      const monthlyTotal = row.slice(2, 14).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      if (monthlyTotal > 0) {
        if (!psClients.has(client)) {
          psClients.set(client, { backlog: 0, pipeline: 0, bestCase: 0 });
        }
        const clientData = psClients.get(client);
        if (type === 'Backlog') clientData.backlog += monthlyTotal;
        else if (type === 'Pipeline') clientData.pipeline += monthlyTotal;
        else if (type === 'Best Cast') clientData.bestCase += monthlyTotal;
      }
    }
  });

  const sortedPSClients = [...psClients.entries()]
    .map(([client, data]) => ({
      client,
      backlog: data.backlog,
      pipeline: data.pipeline,
      bestCase: data.bestCase,
      total: data.backlog + data.pipeline + data.bestCase
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  sortedPSClients.forEach(c => {
    console.log(`  🔧 ${c.client}: $${(c.total/1000).toFixed(0)}K (Backlog: $${(c.backlog/1000).toFixed(0)}K, Pipeline: $${(c.pipeline/1000).toFixed(0)}K)`);
  });
  analysis.revenueByStream.professionalServices = sortedPSClients;

  // 7. BUSINESS CASES / DIAL 2
  console.log('\n=== 7. BUSINESS CASES (DIAL 2) ===');
  const dial2 = XLSX.utils.sheet_to_json(workbook.Sheets['Dial 2 Risk Profile Summary'], { header: 1 });
  let bcCount = 0;
  dial2.forEach((row, i) => {
    if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '' && i > 5) {
      // Look for rows with client/opportunity data
      const hasValue = row.some(cell => typeof cell === 'number' && cell > 1000);
      if (hasValue && bcCount < 15) {
        bcCount++;
        const values = row.filter(cell => typeof cell === 'number').slice(0, 3);
        console.log(`  🎯 ${row[0]}: ${values.map(v => '$' + (v/1000).toFixed(0) + 'K').join(' | ')}`);
      }
    }
  });

  // 8. QUARTERLY SUMMARY
  console.log('\n=== 8. QUARTERLY TARGETS ===');
  const qComp = XLSX.utils.sheet_to_json(workbook.Sheets['26 vs 25 Q Comparison'], { header: 1 });
  qComp.slice(0, 30).forEach((row, i) => {
    if (row[0] && typeof row[0] === 'string') {
      const label = row[0].toLowerCase();
      if (label.includes('revenue') || label.includes('ebita') || label.includes('margin')) {
        console.log(`  📊 ${row.slice(0, 6).join(' | ')}`);
      }
    }
  });

  console.log('\n=== SUMMARY ===');
  console.log(`📊 Attrition Risks: ${analysis.attritionRisks.length} clients identified`);
  console.log(`💵 Maintenance Clients: ${sortedClients.length} with revenue`);
  console.log(`🔧 PS Clients: ${sortedPSClients.length} with revenue`);

  const totalAtRisk = analysis.attritionRisks.reduce((sum, r) => sum + r.totalAtRisk, 0);
  console.log(`⚠️ Total Revenue at Risk: $${(totalAtRisk).toFixed(0)}K`);

  return analysis;
}

analyseBURC().catch(console.error);
