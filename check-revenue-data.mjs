import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllRevenueData() {
  // Check burc_historical_revenue_detail
  const { data: historical } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, revenue_type, amount_usd')
    .order('fiscal_year', { ascending: true });

  // Group by year and type
  const byYearType = {};
  for (const row of historical || []) {
    const key = `${row.fiscal_year}_${row.revenue_type}`;
    if (!byYearType[key]) {
      byYearType[key] = { fiscal_year: row.fiscal_year, revenue_type: row.revenue_type, total: 0 };
    }
    byYearType[key].total += row.amount_usd || 0;
  }

  console.log('Historical Revenue by Year and Type:');
  console.log('-'.repeat(80));

  const sorted = Object.values(byYearType).sort((a, b) => {
    if (a.fiscal_year !== b.fiscal_year) return a.fiscal_year - b.fiscal_year;
    return a.revenue_type.localeCompare(b.revenue_type);
  });

  // Group by year for display
  let currentYear = null;
  let yearTotal = 0;

  for (const row of sorted) {
    if (row.fiscal_year !== currentYear) {
      if (currentYear !== null) {
        console.log(`  Year Total: $${yearTotal.toLocaleString()}`);
        console.log('');
      }
      currentYear = row.fiscal_year;
      yearTotal = 0;
      console.log(`FY${row.fiscal_year}:`);
    }
    console.log(`  ${row.revenue_type.padEnd(40)} $${row.total.toLocaleString()}`);
    yearTotal += row.total;
  }

  if (currentYear !== null) {
    console.log(`  Year Total: $${yearTotal.toLocaleString()}`);
  }

  // Also check pipeline for 2026 forecast
  const { data: pipeline } = await supabase
    .from('burc_pipeline_detail')
    .select('net_booking, section_color, in_forecast')
    .eq('fiscal_year', 2026)
    .eq('pipeline_status', 'active');

  const pipelineTotal = pipeline?.reduce((sum, p) => sum + (p.net_booking || 0), 0) || 0;
  const forecastItems = pipeline?.filter(p => p.in_forecast) || [];
  const forecastTotal = forecastItems.reduce((sum, p) => sum + (p.net_booking || 0), 0);

  console.log('');
  console.log('='.repeat(80));
  console.log('FY2026 Pipeline Data (for forecast):');
  console.log('-'.repeat(80));
  console.log(`Total Pipeline: $${pipelineTotal.toLocaleString()}`);
  console.log(`In Forecast (Green+Yellow): $${forecastTotal.toLocaleString()}`);
  console.log(`Pipeline items: ${pipeline?.length || 0}`);
  console.log(`Forecast items: ${forecastItems.length}`);

  // Calculate 2026 forecast based on 2025 growth rate
  const fy2025Total = Object.values(byYearType)
    .filter(r => r.fiscal_year === 2025)
    .reduce((sum, r) => sum + r.total, 0);

  const fy2024Total = Object.values(byYearType)
    .filter(r => r.fiscal_year === 2024)
    .reduce((sum, r) => sum + r.total, 0);

  const growthRate = fy2024Total > 0 ? ((fy2025Total - fy2024Total) / fy2024Total) * 100 : 0;
  const projectedFY2026 = fy2025Total * (1 + growthRate / 100);

  console.log('');
  console.log('Forecast Projection:');
  console.log('-'.repeat(80));
  console.log(`FY2024 Total: $${fy2024Total.toLocaleString()}`);
  console.log(`FY2025 Total: $${fy2025Total.toLocaleString()}`);
  console.log(`YoY Growth: ${growthRate.toFixed(1)}%`);
  console.log(`Projected FY2026 (same growth): $${projectedFY2026.toLocaleString()}`);
}

checkAllRevenueData();
