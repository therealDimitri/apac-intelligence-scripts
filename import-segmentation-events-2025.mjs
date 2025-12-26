/**
 * Import Segmentation Events from Excel (2025)
 *
 * This script imports client segmentation events from the Excel file
 * into the Supabase segmentation_events table.
 *
 * Date: 2025-12-15
 */

import XLSX from 'xlsx';
import https from 'https';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

// Configuration - SECURITY: Use environment variables for secrets
const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Clients - Client Success/Client Segmentation/APAC Client Segmentation Activity Register 2025.xlsx';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Please set these in .env.local');
  process.exit(1);
}

// Event name to UUID mapping
const EVENT_TYPE_MAP = {
  'President/Group Leader Engagement (in person)': 'ff6b28a6-9204-4bba-a55a-89100e3b5775',
  'EVP Engagement': 'f1fa97ca-2a61-4aa0-a21f-d873d2858774',
  'Strategic Ops Plan (Partnership) Meeting': '27c07668-0e0f-4c87-9b81-a011f5a8ba35',
  'Satisfaction Action Plan': '826451d7-274f-4e2e-9e83-dbae6ba2e14e',
  'SLA/Service Review Meeting': '84068dd3-cc5f-4a82-9980-3002c17f5e4d',
  'CE On-Site Attendance': '5a4899ce-a007-430a-8b14-73d17c6bd8b0',
  'Insight Touch Point': 'e177a096-82c1-4710-a599-4000c5343d06',
  'Health Check (Opal)': 'cf5c4f53-c562-4ab7-81f9-b4c79d34089a',
  'Upcoming Release Planning': '8790dac1-b731-43d7-a28e-f8df4b9838b1',
  'Whitespace Demos (Sunrise)': '79f7ee4a-def2-4de2-91cd-43f6d2d9296e',
  'APAC Client Forum / User Group': 'f07d80e9-ccaf-4551-9e6d-d74c47e14583',
  'Updating Client 360': '5951ecd1-016d-4567-a0b6-a68b581d03c8',
};

// Month names to search for in header row
const MONTH_NAMES = [
  { month: 1, name: 'January' },
  { month: 2, name: 'February' },
  { month: 3, name: 'March' },
  { month: 4, name: 'April' },
  { month: 5, name: 'May' },
  { month: 6, name: 'June' },
  { month: 7, name: 'July' },
  { month: 8, name: 'August' },
  { month: 9, name: 'September' },
  { month: 10, name: 'October' },
  { month: 11, name: 'November' },
  { month: 12, name: 'December' },
];

/**
 * Get month columns for a sheet - DYNAMICALLY detects ALL month positions
 * Each sheet can have different column layouts (some have extra columns between months)
 * The month name appears in row 3, and the completed checkbox is in that column,
 * with the date in the following column.
 */
function getMonthColumns(sheet) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const row3 = data[2] || [];

  const monthColumns = [];

  for (const monthInfo of MONTH_NAMES) {
    // Find the column index where this month name appears
    const colIdx = row3.findIndex(v => v === monthInfo.name);

    if (colIdx !== -1) {
      monthColumns.push({
        month: monthInfo.month,
        name: monthInfo.name,
        completedCol: colIdx,
        dateCol: colIdx + 1,
      });
    }
  }

  return monthColumns;
}

// Client name mapping (Excel sheet name -> Database client_segmentation name)
// These MUST match the client_segmentation table exactly for the dashboard to work
const CLIENT_NAME_MAP = {
  'Albury-Wodonga (AWH)': 'Albury Wodonga Health',
  'Barwon Health': 'Barwon Health Australia',  // Dashboard uses "Australia" suffix
  'GHA': 'Gippsland Health Alliance (GHA)',    // GHA = Gippsland, not Gold Coast
  'Grampians': 'Grampians Health',
  'Epworth': 'Epworth Healthcare',              // lowercase 'c' in Healthcare
  'GRMC': 'Guam Regional Medical City (GRMC)', // GRMC = Guam Regional Medical City
  'MINDEF-NCS': 'NCS/MinDef Singapore',
  'Mount Alvernia': 'Mount Alvernia Hospital',
  'RVEEH': 'Royal Victorian Eye and Ear Hospital',
  'SA Health iPro': 'SA Health (iPro)',
  'SA Health iQemo': 'SA Health (iQemo)',
  'SA Health Sunrise': 'SA Health (Sunrise)',
  'SingHealth': 'SingHealth',
  'SLMC': "Saint Luke's Medical Centre (SLMC)", // Full name with abbreviation
  'Vic Health': 'Department of Health - Victoria',
  'WA Health': 'WA Health',
  'Waikato': 'Te Whatu Ora Waikato',            // New NZ health authority name
  'Western Health': 'Western Health',
};

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: `/rest/v1/${path}`,
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel serial numbers for 2025 are around 45658-46022
  // Reject small values that aren't valid 2025 dates
  if (serial < 44000) return null; // Before ~2020
  if (serial > 50000) return null; // After ~2036

  // Excel dates are days since 1899-12-30
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  return dateInfo.toISOString().split('T')[0];
}

function isCompleted(value) {
  return value === true || value === 'TRUE' || value === 'true' ||
         value === 1 || value === '1' || value === 'Y' || value === 'y';
}

function parseClientSheet(sheet, sheetName) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const events = [];
  const clientName = CLIENT_NAME_MAP[sheetName] || sheetName;

  // Get dynamic month columns based on sheet structure
  const MONTH_COLUMNS = getMonthColumns(sheet);

  console.log(`\n  Processing: ${sheetName} -> ${clientName}`);

  // Data rows start at index 4 (row 5 in Excel)
  for (let rowIdx = 4; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    if (!row) continue;

    const eventName = row[1];
    if (!eventName || typeof eventName !== 'string') continue;

    const eventTypeId = EVENT_TYPE_MAP[eventName.trim()];
    if (!eventTypeId) {
      console.log(`    ⚠️  Unknown event type: "${eventName}"`);
      continue;
    }

    // Check each month for completion
    for (const monthInfo of MONTH_COLUMNS) {
      const completed = isCompleted(row[monthInfo.completedCol]);
      const dateValue = row[monthInfo.dateCol];

      // Only create events that are marked completed or have a date
      if (!completed && !dateValue) continue;

      const defaultDate = `2025-${String(monthInfo.month).padStart(2, '0')}-01`;
      const parsedDate = (dateValue && typeof dateValue === 'number')
        ? excelDateToJS(dateValue)
        : null;
      const eventDate = parsedDate || defaultDate; // Always fall back to default if no valid date

      events.push({
        client_name: clientName,
        event_type_id: eventTypeId,
        event_date: eventDate,
        // event_month and event_year are auto-generated from event_date
        completed: completed,
        completed_date: completed && eventDate ? eventDate : null,
        notes: `Imported from Excel on ${new Date().toISOString().split('T')[0]}`,
        expected_count: 1,
        period: `${monthInfo.name.substring(0, 3)} 2025`,
      });
    }
  }

  console.log(`    Found ${events.length} events`);
  return events;
}

async function main() {
  console.log('='.repeat(80));
  console.log('SEGMENTATION EVENTS IMPORT - December 2025');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Check if file exists
  console.log('Step 1: Checking Excel file...');
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ File not found: ${EXCEL_PATH}`);
    process.exit(1);
  }
  console.log('✅ File found');

  // Step 2: Get current record count
  console.log('\nStep 2: Checking current database state...');
  const countResult = await makeRequest('GET', 'segmentation_events?select=count');
  console.log(`  Current records in database: ${countResult.data?.[0]?.count || 0}`);

  // Step 3: Delete existing 2025 records
  console.log('\nStep 3: Clearing existing 2025 records...');
  const deleteResult = await makeRequest('DELETE', 'segmentation_events?event_year=eq.2025');
  console.log(`  Delete status: ${deleteResult.status}`);

  // Step 4: Parse Excel file
  console.log('\nStep 4: Parsing Excel file...');
  const buffer = fs.readFileSync(EXCEL_PATH);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const clientSheets = workbook.SheetNames.filter(
    name => name !== 'Client Segments - Sept' && name !== 'Activities'
  );
  console.log(`  Found ${clientSheets.length} client sheets`);

  const allEvents = [];
  for (const sheetName of clientSheets) {
    const sheet = workbook.Sheets[sheetName];
    const events = parseClientSheet(sheet, sheetName);
    allEvents.push(...events);
  }

  console.log(`\nTotal events to import: ${allEvents.length}`);

  // Step 5: Import events in batches
  console.log('\nStep 5: Importing events...');
  const BATCH_SIZE = 100;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    const result = await makeRequest('POST', 'segmentation_events', batch);

    if (result.status === 201) {
      successCount += batch.length;
      process.stdout.write(`  Imported: ${successCount}/${allEvents.length}\r`);
    } else {
      errorCount += batch.length;
      console.error(`\n  ❌ Batch error at ${i}: ${result.status}`);
      console.error(`  ${JSON.stringify(result.data).substring(0, 200)}`);
    }
  }

  console.log(`\n  ✅ Successfully imported: ${successCount}`);
  if (errorCount > 0) {
    console.log(`  ❌ Failed: ${errorCount}`);
  }

  // Step 6: Verification
  console.log('\nStep 6: Verification...');
  const verifyResult = await makeRequest('GET', 'segmentation_events?select=count&event_year=eq.2025');
  console.log(`  2025 records in database: ${verifyResult.data?.[0]?.count || 0}`);

  // Get breakdown by client
  console.log('\n  Breakdown by client:');
  for (const sheetName of clientSheets) {
    const clientName = CLIENT_NAME_MAP[sheetName] || sheetName;
    const clientResult = await makeRequest(
      'GET',
      `segmentation_events?select=count&client_name=eq.${encodeURIComponent(clientName)}&event_year=eq.2025`
    );
    const count = clientResult.data?.[0]?.count || 0;
    if (count > 0) {
      console.log(`    ${clientName}: ${count} events`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ IMPORT COMPLETE');
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
