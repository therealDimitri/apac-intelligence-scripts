/**
 * Sync 2026 CSI OPEX data from Excel to Database
 *
 * Reads the APAC BURC sheet from 2026 APAC Performance.xlsx
 * and updates the burc_csi_opex table with correct monthly values.
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

// Column mapping: C=Jan(1), D=Feb(2), ... N=Dec(12)
const MONTH_COLS = {
  1: 'C',   // Jan
  2: 'D',   // Feb
  3: 'E',   // Mar
  4: 'F',   // Apr
  5: 'G',   // May
  6: 'H',   // Jun
  7: 'I',   // Jul
  8: 'J',   // Aug
  9: 'K',   // Sep
  10: 'L',  // Oct
  11: 'M',  // Nov
  12: 'N',  // Dec
};

// Row numbers for data (from APAC BURC sheet)
const ROWS = {
  LICENSE_NR: 56,
  PS_NR: 57,
  MAINTENANCE_NR: 58,
  HW_OTHER_NR: 59,
  PS_OPEX: 69,
  MAINTENANCE_OPEX: 74,
  SM_OPEX: 80,
  RD_OPEX: 86,
  GA_OPEX: 93,
};

function getCellValue(sheet, col, row) {
  const cell = sheet[col + row];
  if (!cell) return 0;
  return typeof cell.v === 'number' ? cell.v : 0;
}

async function syncData() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);

  const sheet = workbook.Sheets['APAC BURC'];
  if (!sheet) {
    console.error('APAC BURC sheet not found!');
    process.exit(1);
  }

  console.log('\nExtracting 2026 monthly data...\n');

  const monthlyData = [];

  for (let month = 1; month <= 12; month++) {
    const col = MONTH_COLS[month];
    const monthName = new Date(2026, month - 1, 1).toLocaleString('en-AU', { month: 'short' });

    const data = {
      year: 2026,
      month_num: month,
      month: monthName,
      license_nr: getCellValue(sheet, col, ROWS.LICENSE_NR),
      ps_nr: getCellValue(sheet, col, ROWS.PS_NR),
      maintenance_nr: getCellValue(sheet, col, ROWS.MAINTENANCE_NR),
      hw_other_nr: getCellValue(sheet, col, ROWS.HW_OTHER_NR),
      ps_opex: getCellValue(sheet, col, ROWS.PS_OPEX),
      maintenance_opex: getCellValue(sheet, col, ROWS.MAINTENANCE_OPEX),
      sm_opex: getCellValue(sheet, col, ROWS.SM_OPEX),
      rd_opex: getCellValue(sheet, col, ROWS.RD_OPEX),
      ga_opex: getCellValue(sheet, col, ROWS.GA_OPEX),
    };

    // Calculate total NR
    data.total_nr = data.license_nr + data.ps_nr + data.maintenance_nr + data.hw_other_nr;

    // Calculate ratios for verification
    const psRatio = data.ps_opex > 0 ? data.ps_nr / data.ps_opex : 0;
    const salesRatio = data.sm_opex > 0 ? (0.7 * data.license_nr) / data.sm_opex : 0;
    const maintRatio = data.maintenance_opex > 0 ? (0.85 * data.maintenance_nr) / data.maintenance_opex : 0;
    const rdRatio = data.rd_opex > 0 ? (0.3 * data.license_nr + 0.15 * data.maintenance_nr) / data.rd_opex : 0;
    const gaRatio = data.total_nr > 0 ? (data.ga_opex / data.total_nr) * 100 : 0;

    console.log(`${monthName} 2026:`);
    console.log(`  Revenue: Lic=$${data.license_nr.toLocaleString()}, PS=$${data.ps_nr.toLocaleString()}, Maint=$${data.maintenance_nr.toLocaleString()}`);
    console.log(`  OPEX: PS=$${data.ps_opex.toLocaleString()}, Maint=$${data.maintenance_opex.toLocaleString()}, S&M=$${data.sm_opex.toLocaleString()}`);
    console.log(`  Ratios: PS=${psRatio.toFixed(2)}, Sales=${salesRatio.toFixed(2)}, Maint=${maintRatio.toFixed(2)}, R&D=${rdRatio.toFixed(2)}, G&A=${gaRatio.toFixed(1)}%`);
    console.log('');

    monthlyData.push(data);
  }

  console.log('\n--- Updating database ---\n');

  for (const data of monthlyData) {
    // Check if record exists
    const { data: existing, error: checkError } = await supabase
      .from('burc_csi_opex')
      .select('id')
      .eq('year', data.year)
      .eq('month_num', data.month_num)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error(`Error checking ${data.month} ${data.year}:`, checkError);
      continue;
    }

    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('burc_csi_opex')
        .update({
          license_nr: data.license_nr,
          ps_nr: data.ps_nr,
          maintenance_nr: data.maintenance_nr,
          total_nr: data.total_nr,
          ps_opex: data.ps_opex,
          maintenance_opex: data.maintenance_opex,
          sm_opex: data.sm_opex,
          rd_opex: data.rd_opex,
          ga_opex: data.ga_opex,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`Error updating ${data.month} ${data.year}:`, updateError);
      } else {
        console.log(`✅ Updated ${data.month} ${data.year}`);
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('burc_csi_opex')
        .insert({
          year: data.year,
          month_num: data.month_num,
          month: data.month,
          license_nr: data.license_nr,
          ps_nr: data.ps_nr,
          maintenance_nr: data.maintenance_nr,
          total_nr: data.total_nr,
          ps_opex: data.ps_opex,
          maintenance_opex: data.maintenance_opex,
          sm_opex: data.sm_opex,
          rd_opex: data.rd_opex,
          ga_opex: data.ga_opex,
        });

      if (insertError) {
        console.error(`Error inserting ${data.month} ${data.year}:`, insertError);
      } else {
        console.log(`✅ Inserted ${data.month} ${data.year}`);
      }
    }
  }

  console.log('\n✅ Sync complete!');
}

syncData().catch(console.error);
