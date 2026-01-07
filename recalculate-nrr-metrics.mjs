/**
 * Recalculate NRR/GRR Metrics from burc_historical_revenue_detail
 *
 * NRR (Net Revenue Retention) = (Starting + Expansion - Contraction - Churn) / Starting * 100
 * GRR (Gross Revenue Retention) = (Starting - Contraction - Churn) / Starting * 100
 *
 * Where:
 * - Starting = Previous year revenue from clients who existed in previous year
 * - Expansion = Revenue increase from existing clients
 * - Contraction = Revenue decrease from existing clients (still active)
 * - Churn = Revenue lost from clients who left entirely
 * - New Business = Revenue from clients who didn't exist in previous year
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateNRR() {
  console.log('=== Recalculating NRR/GRR Metrics ===\n');

  // Fetch all revenue data
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, fiscal_year, amount_usd');

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  // Aggregate by client and year
  const clientYearRevenue = {};
  for (const row of data || []) {
    const client = row.client_name;
    const year = row.fiscal_year;
    const amount = parseFloat(row.amount_usd) || 0;

    if (!clientYearRevenue[client]) {
      clientYearRevenue[client] = {};
    }
    if (!clientYearRevenue[client][year]) {
      clientYearRevenue[client][year] = 0;
    }
    clientYearRevenue[client][year] += amount;
  }

  // Get all years
  const years = [...new Set(data.map(r => r.fiscal_year))].sort();
  console.log('Years in data:', years.join(', '));
  console.log('Clients:', Object.keys(clientYearRevenue).length);
  console.log('');

  // Calculate NRR/GRR for each year
  const metrics = [];

  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const prevYear = years[i - 1];

    let startingRevenue = 0;
    let expansion = 0;
    let contraction = 0;
    let churn = 0;
    let newBusiness = 0;
    let currentYearTotal = 0;

    for (const [client, yearData] of Object.entries(clientYearRevenue)) {
      const prevRev = prevYear ? (yearData[prevYear] || 0) : 0;
      const currRev = yearData[year] || 0;

      currentYearTotal += currRev;

      if (prevYear) {
        if (prevRev > 0 && currRev > 0) {
          // Existing client
          startingRevenue += prevRev;
          if (currRev > prevRev) {
            expansion += (currRev - prevRev);
          } else if (currRev < prevRev) {
            contraction += (prevRev - currRev);
          }
        } else if (prevRev > 0 && currRev === 0) {
          // Churned client
          startingRevenue += prevRev;
          churn += prevRev;
        } else if (prevRev === 0 && currRev > 0) {
          // New client
          newBusiness += currRev;
        }
      } else {
        // First year - all is new business
        newBusiness += currRev;
      }
    }

    // Calculate NRR and GRR
    let nrr = 0;
    let grr = 0;

    if (startingRevenue > 0) {
      // NRR = (Starting + Expansion - Contraction - Churn) / Starting * 100
      nrr = ((startingRevenue + expansion - contraction - churn) / startingRevenue) * 100;
      // GRR = (Starting - Contraction - Churn) / Starting * 100
      grr = ((startingRevenue - contraction - churn) / startingRevenue) * 100;
    }

    metrics.push({
      year,
      nrr: Math.round(nrr * 10) / 10,
      grr: Math.round(grr * 10) / 10,
      expansion: Math.round(expansion),
      contraction: Math.round(contraction),
      churn: Math.round(churn),
      newBusiness: Math.round(newBusiness),
      startingRevenue: Math.round(startingRevenue),
      currentYearTotal: Math.round(currentYearTotal),
      isForecast: false,
    });
  }

  // Display results
  console.log('=== Calculated NRR/GRR Metrics ===\n');
  console.log('Year | NRR    | GRR    | Expansion    | Contraction  | Churn        | New Business | Total');
  console.log('-'.repeat(105));

  for (const m of metrics) {
    console.log(
      `${m.year} | ${m.nrr.toFixed(1).padStart(5)}% | ${m.grr.toFixed(1).padStart(5)}% | ` +
      `$${(m.expansion/1e6).toFixed(2).padStart(6)}M | $${(m.contraction/1e6).toFixed(2).padStart(6)}M | ` +
      `$${(m.churn/1e6).toFixed(2).padStart(6)}M | $${(m.newBusiness/1e6).toFixed(2).padStart(6)}M | ` +
      `$${(m.currentYearTotal/1e6).toFixed(2)}M`
    );
  }

  // Generate code for API
  console.log('\n\n=== Code for API (PRECOMPUTED_NRR_METRICS) ===\n');
  console.log('const PRECOMPUTED_NRR_METRICS = [');
  for (const m of metrics) {
    console.log(`  {
    year: ${m.year},
    nrr: ${m.nrr},
    grr: ${m.grr},
    expansion: ${m.expansion},
    contraction: ${m.contraction},
    churn: ${m.churn},
    newBusiness: ${m.newBusiness},
    isForecast: false,
  },`);
  }

  // Add 2026 forecast based on 3-year average
  const last3 = metrics.slice(-3);
  const avgNRR = last3.reduce((s, m) => s + m.nrr, 0) / 3;
  const avgGRR = last3.reduce((s, m) => s + m.grr, 0) / 3;

  console.log(`  // FY2026 Forecast - based on 3-year average (${last3.map(m => m.year).join('-')})
  // NRR avg: ${avgNRR.toFixed(1)}% → adjusted conservatively
  // GRR avg: ${avgGRR.toFixed(1)}% → adjusted conservatively
  {
    year: 2026,
    nrr: ${Math.round(avgNRR * 0.95)},
    grr: ${Math.round(avgGRR * 0.95)},
    expansion: 8000000,
    contraction: 6000000,
    churn: 1000000,
    newBusiness: 5000000,
    isForecast: true,
  },`);
  console.log('];');
}

calculateNRR().catch(console.error);
