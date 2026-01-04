import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check2026Data() {
  console.log('=== 2026 CSI Ratios Data ===\n');

  // Get 2026 data
  const { data: data2026 } = await supabase
    .from('burc_csi_ratios')
    .select('*')
    .eq('year', 2026)
    .order('month_num');

  console.log('2026 Records:', data2026?.length || 0);

  if (data2026?.length > 0) {
    console.log('\nMonth | PS Ratio | Sales Ratio | Maint Ratio | R&D Ratio | G&A Ratio');
    console.log('-'.repeat(75));
    data2026.forEach(r => {
      const ps = r.ps_ratio?.toFixed(2) || 'N/A';
      const sales = r.sales_ratio?.toFixed(2) || 'N/A';
      const maint = r.maintenance_ratio?.toFixed(2) || 'N/A';
      const rd = r.rd_ratio?.toFixed(2) || 'N/A';
      const ga = r.ga_ratio?.toFixed(2) || 'N/A';
      console.log(`  ${r.month_num}  |   ${ps}  |    ${sales}   |    ${maint}   |   ${rd}  |   ${ga}`);
    });
  }

  // Check all years data summary
  console.log('\n=== All Years Summary ===');
  const { data: allData } = await supabase
    .from('burc_csi_ratios')
    .select('year, month_num, sales_ratio, ps_ratio, maintenance_ratio, rd_ratio, ga_ratio')
    .order('year')
    .order('month_num');

  const byYear = {};
  allData?.forEach(r => {
    if (!byYear[r.year]) byYear[r.year] = [];
    byYear[r.year].push(r);
  });

  Object.entries(byYear).forEach(([year, records]) => {
    const avgSales = records.reduce((s, r) => s + (r.sales_ratio || 0), 0) / records.length;
    const avgPS = records.reduce((s, r) => s + (r.ps_ratio || 0), 0) / records.length;
    const avgMaint = records.reduce((s, r) => s + (r.maintenance_ratio || 0), 0) / records.length;
    const avgRD = records.reduce((s, r) => s + (r.rd_ratio || 0), 0) / records.length;
    const avgGA = records.reduce((s, r) => s + (r.ga_ratio || 0), 0) / records.length;
    console.log(`${year}: ${records.length} months`);
    console.log(`  PS: ${avgPS.toFixed(2)}, Sales: ${avgSales.toFixed(4)}, Maint: ${avgMaint.toFixed(2)}, R&D: ${avgRD.toFixed(2)}, G&A: ${avgGA.toFixed(2)}`);
  });

  // Check why sales ratio might be 0 in UI - look at latest data
  console.log('\n=== Latest CSI Ratio (Jan 2026) ===');
  const { data: jan2026 } = await supabase
    .from('burc_csi_ratios')
    .select('*')
    .eq('year', 2026)
    .eq('month_num', 1)
    .single();

  if (jan2026) {
    console.log(JSON.stringify(jan2026, null, 2));
  }

  // Check what the CSI API route is returning
  console.log('\n=== Checking data coverage ===');
  console.log('Total records:', allData?.length);
  console.log('Date range: 2023-01 to 2026-12 =', 48, 'months expected');

  // Check for NULL or 0 values
  const zeroSales = allData?.filter(r => r.sales_ratio === 0 || r.sales_ratio === null);
  console.log('\nRecords with 0 or NULL sales_ratio:', zeroSales?.length);
  if (zeroSales?.length > 0) {
    console.log('Months:', zeroSales.map(r => `${r.year}-${r.month_num}`).join(', '));
  }
}

async function checkOpexData() {
  // Check burc_csi_opex table
  const { data, error } = await supabase
    .from('burc_csi_opex')
    .select('year, month_num, month, license_nr, sm_opex, ps_nr, ps_opex, maintenance_nr, maintenance_opex, rd_opex, ga_opex, total_nr')
    .eq('year', 2026)
    .order('month_num');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('\n=== 2026 OPEX/Revenue Data (Source for Sales Ratio) ===\n');
  console.log('Month | License NR | S&M OPEX | Calculated Sales Ratio');
  console.log('-'.repeat(60));

  data?.forEach(r => {
    const licenseNR = r.license_nr || 0;
    const smOpex = Math.abs(r.sm_opex || 0);
    const salesRatio = smOpex > 0 ? (0.7 * licenseNR) / smOpex : 0;

    const licStr = (licenseNR/1000).toFixed(0).padStart(8) + 'k';
    const smStr = (smOpex/1000).toFixed(0).padStart(7) + 'k';
    const ratioStr = salesRatio.toFixed(2).padStart(10);

    console.log(`${r.month?.padEnd(5) || 'N/A'} | ${licStr} | ${smStr} | ${ratioStr}`);
  });

  console.log('\n=== Key Finding ===');
  const zeroLicense = data?.filter(r => r.license_nr === null || r.license_nr === 0);
  const zeroSM = data?.filter(r => r.sm_opex === null || r.sm_opex === 0);
  console.log('Months with 0/null License NR:', zeroLicense?.length);
  console.log('Months with 0/null S&M OPEX:', zeroSM?.length);

  if (zeroLicense?.length > 0) {
    console.log('  → License NR is 0 for:', zeroLicense.map(r => r.month).join(', '));
  }
  if (zeroSM?.length > 0) {
    console.log('  → S&M OPEX is 0 for:', zeroSM.map(r => r.month).join(', '));
  }
}

async function checkLicenseData() {
  // Check monthly metrics for license-related data
  const { data } = await supabase
    .from('burc_monthly_metrics')
    .select('fiscal_year, month_num, month_name, metric_name, value')
    .eq('fiscal_year', 2026)
    .ilike('metric_name', '%licen%')
    .order('month_num');

  console.log('\n=== License-related metrics in burc_monthly_metrics ===');
  console.log('Found:', data?.length || 0, 'records');
  if (data?.length > 0) {
    const byMetric = {};
    data.forEach(r => {
      const key = r.metric_name;
      if (byMetric[key] === undefined) byMetric[key] = [];
      byMetric[key].push({month: r.month_num, value: r.value});
    });
    Object.entries(byMetric).forEach(([name, vals]) => {
      console.log('\n' + name + ':');
      vals.forEach(v => console.log('  Month ' + v.month + ': $' + (v.value/1000).toFixed(0) + 'k'));
    });
  }

  // Also check quarterly data
  const { data: quarterly } = await supabase
    .from('burc_quarterly_data')
    .select('*')
    .eq('fiscal_year', 2026)
    .ilike('metric_name', '%licen%');

  console.log('\n=== Quarterly License Data ===');
  console.log('Found:', quarterly?.length || 0);
  quarterly?.forEach(q => console.log(q.metric_name + ': Q1=$' + (q.q1_value/1000).toFixed(0) + 'k, Q2=$' + (q.q2_value/1000).toFixed(0) + 'k, Q3=$' + (q.q3_value/1000).toFixed(0) + 'k, Q4=$' + (q.q4_value/1000).toFixed(0) + 'k'));
}

async function checkForecastData() {
  console.log('\n=== Checking for PLAN/FORECAST licence data in 2026 ===\n');

  // Check monthly metrics for plan/budget/forecast data
  const { data: metrics } = await supabase
    .from('burc_monthly_metrics')
    .select('*')
    .eq('fiscal_year', 2026)
    .or('metric_category.ilike.%plan%,metric_category.ilike.%budget%,metric_category.ilike.%forecast%,metric_name.ilike.%plan%,metric_name.ilike.%budget%')
    .order('month_num');

  console.log('Plan/Budget metrics found:', metrics?.length || 0);
  if (metrics?.length > 0) {
    const categories = [...new Set(metrics.map(m => m.metric_category))];
    console.log('Categories:', categories.join(', '));

    // Show licence-related plan data
    const licMetrics = metrics.filter(m => m.metric_name.toLowerCase().includes('licen'));
    console.log('\nLicence plan metrics:', licMetrics.length);
    licMetrics.slice(0, 10).forEach(m => {
      console.log('  ' + m.month_name + ': ' + m.metric_name + ' = $' + (m.value/1000).toFixed(0) + 'k');
    });
  }

  // Check burc_csi_opex for plan data columns
  console.log('\n=== burc_csi_opex table columns ===');
  const { data: opexSample } = await supabase
    .from('burc_csi_opex')
    .select('*')
    .eq('year', 2026)
    .eq('month_num', 1)
    .limit(1);

  if (opexSample?.length > 0) {
    console.log('All columns:', Object.keys(opexSample[0]).join(', '));
  }

  // Check if there's plan vs actual distinction
  console.log('\n=== Checking burc_monthly_metrics for License Plan ===');
  const { data: allLic } = await supabase
    .from('burc_monthly_metrics')
    .select('month_num, month_name, metric_name, metric_category, value')
    .eq('fiscal_year', 2026)
    .ilike('metric_name', '%licen%')
    .order('month_num');

  if (allLic?.length > 0) {
    console.log('All licence-related metrics:');
    allLic.forEach(m => {
      console.log('  ' + (m.month_name || 'M' + m.month_num) + ' | ' + m.metric_category + ' | ' + m.metric_name + ' = $' + (m.value/1000).toFixed(0) + 'k');
    });
  }
}

check2026Data().then(() => checkOpexData()).then(() => checkLicenseData()).then(() => checkForecastData()).catch(console.error);
