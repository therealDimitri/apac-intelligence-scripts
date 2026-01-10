#!/usr/bin/env node

/**
 * SLA Report Parser & Sync Script
 * Parses Excel SLA reports and syncs to Supabase
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

// Client SLA report paths
const CLIENT_PATHS = {
  'WA Health': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/WA Health/SLA Reports',
  'SA Health': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/SA Health/SLA Reports',
  'Grampians': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/Grampians/SLA Reports',
  'RVEEH': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/RVEEH/SLA Reports',
  'Barwon Health': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/Barwon Health/SLA Reports',
  'Albury Wodonga Health': '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Clients - Client Success/Client Meetings/Albury Wodonga/SLA Reports',
};

// Month name to number mapping
const MONTH_MAP = {
  'jan': 1, 'january': 1,
  'feb': 2, 'february': 2,
  'mar': 3, 'march': 3,
  'apr': 4, 'april': 4,
  'may': 5,
  'jun': 6, 'june': 6,
  'jul': 7, 'july': 7,
  'aug': 8, 'august': 8,
  'sep': 9, 'sept': 9, 'september': 9,
  'oct': 10, 'october': 10,
  'nov': 11, 'november': 11,
  'dec': 12, 'december': 12,
};

/**
 * Parse period from filename
 */
function parsePeriodFromFilename(filename) {
  const lower = filename.toLowerCase();

  // Try quarterly format: Q4-2025, Q4 2025
  const quarterMatch = lower.match(/q([1-4])[-_\s]?(\d{4})/);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1]);
    const year = parseInt(quarterMatch[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    return {
      type: 'quarterly',
      start: new Date(year, startMonth - 1, 1),
      end: new Date(year, endMonth, 0), // Last day of end month
    };
  }

  // Try monthly format: Oct 2025, October 2025, Nov 2025
  for (const [monthName, monthNum] of Object.entries(MONTH_MAP)) {
    const monthPattern = new RegExp(`${monthName}[^a-z]*?(\\d{4})`, 'i');
    const match = lower.match(monthPattern);
    if (match) {
      const year = parseInt(match[1]);
      return {
        type: 'monthly',
        start: new Date(year, monthNum - 1, 1),
        end: new Date(year, monthNum, 0), // Last day of month
      };
    }
  }

  // Default to current month
  const now = new Date();
  return {
    type: 'monthly',
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

/**
 * Find the best matching sheet by name
 */
function findSheet(workbook, ...names) {
  for (const name of names) {
    const found = workbook.SheetNames.find(s =>
      s.toLowerCase().includes(name.toLowerCase())
    );
    if (found) return workbook.Sheets[found];
  }
  return null;
}

/**
 * Extract case volume metrics
 */
function extractCaseVolume(workbook) {
  const sheet = findSheet(workbook, 'Case Volume', 'Volume');
  if (!sheet) return { incoming: 0, closed: 0, backlog: 0 };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let incoming = 0;
  let closed = 0;
  let backlog = 0;

  // Look for totals in the data
  for (const row of data) {
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').toLowerCase();

    // Look for total rows
    if (firstCell.includes('total') || firstCell.includes('sum')) {
      for (let i = 1; i < row.length; i++) {
        const val = parseFloat(row[i]) || 0;
        if (val > incoming) incoming = val;
      }
    }

    // Look for backlog
    if (firstCell.includes('backlog')) {
      for (let i = 1; i < row.length; i++) {
        const val = parseFloat(row[i]) || 0;
        if (val > backlog) backlog = val;
      }
    }
  }

  // Get most recent month values if totals not found
  if (incoming === 0) {
    // Try to find incoming/closed columns
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      if (row && row.length >= 3) {
        const val1 = parseFloat(row[1]) || 0;
        const val2 = parseFloat(row[2]) || 0;
        if (val1 > 0 || val2 > 0) {
          incoming = val1;
          closed = val2;
          if (row.length >= 4) backlog = parseFloat(row[3]) || 0;
          break;
        }
      }
    }
  }

  return { incoming, closed, backlog };
}

/**
 * Extract open aging cases
 */
function extractAgingCases(workbook) {
  const sheet = findSheet(workbook, 'Open Aging', 'Aging Cases', 'Aging Rough');
  if (!sheet) return { total: 0, byAge: {}, byPriority: {}, cases: [] };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const cases = [];
  const byPriority = { critical: 0, high: 0, moderate: 0, low: 0 };
  const byAge = { '0-7d': 0, '8-30d': 0, '31-60d': 0, '61-90d': 0, '90d+': 0 };

  // Find header row
  let headerRow = -1;
  let headers = {};

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('number') || rowStr.includes('case') || rowStr.includes('priority')) {
      headerRow = i;
      row.forEach((cell, idx) => {
        const cellLower = String(cell || '').toLowerCase();
        if (cellLower.includes('number')) headers.caseNumber = idx;
        if (cellLower.includes('priority')) headers.priority = idx;
        if (cellLower.includes('opened')) headers.opened = idx;
        if (cellLower.includes('state') || cellLower.includes('status')) headers.state = idx;
        if (cellLower.includes('assigned')) headers.assignedTo = idx;
        if (cellLower.includes('description')) headers.description = idx;
      });
      break;
    }
  }

  // Parse cases
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[headers.caseNumber]) continue;

    const caseNum = String(row[headers.caseNumber] || '');
    if (!caseNum || caseNum.toLowerCase().includes('count')) continue;

    const priority = String(row[headers.priority] || '').toLowerCase();
    const opened = row[headers.opened];

    // Count by priority
    if (priority.includes('critical') || priority.includes('1')) byPriority.critical++;
    else if (priority.includes('high') || priority.includes('2')) byPriority.high++;
    else if (priority.includes('moderate') || priority.includes('3')) byPriority.moderate++;
    else byPriority.low++;

    // Calculate age
    let openedDate;
    if (typeof opened === 'number') {
      // Excel serial date
      openedDate = new Date((opened - 25569) * 86400 * 1000);
    } else if (opened) {
      openedDate = new Date(opened);
    }

    if (openedDate && !isNaN(openedDate.getTime())) {
      const ageInDays = Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24));

      if (ageInDays <= 7) byAge['0-7d']++;
      else if (ageInDays <= 30) byAge['8-30d']++;
      else if (ageInDays <= 60) byAge['31-60d']++;
      else if (ageInDays <= 90) byAge['61-90d']++;
      else byAge['90d+']++;

      cases.push({
        case_number: caseNum,
        priority: row[headers.priority],
        opened_at: openedDate.toISOString(),
        state: row[headers.state],
        assigned_to: row[headers.assignedTo],
        short_description: row[headers.description],
      });
    }
  }

  return {
    total: cases.length,
    byAge,
    byPriority,
    cases,
  };
}

/**
 * Extract SLA compliance percentages
 * Parses the "SLA Compliance" worksheet which has sections like:
 * - "Monthly Response Time Compliance" with a Grand Total row
 * - "Resolution Compliance" with a Grand Total row
 * - "Ongoing Engagement Compliance" with a Grand Total row
 *
 * Each section has:
 *   Row: Section header (e.g., "Monthly Response Time Compliance")
 *   Row: Column headers (Month | SLA Met | SLA Missed | Grand Total | Compliance %)
 *   Rows: Monthly data
 *   Row: Grand Total with compliance percentage in last column
 */
function extractSLACompliance(workbook) {
  const sheet = findSheet(workbook, 'SLA Compliance', 'Resolution Compliance', 'Response');
  if (!sheet) return { response: null, resolution: null, breachCount: 0 };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let response = null;
  let resolution = null;
  let breachCount = 0;

  // Track which section we're in
  let currentSection = null;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').toLowerCase().trim();

    // Detect section headers
    if (firstCell.includes('response') && firstCell.includes('time') && firstCell.includes('compliance')) {
      currentSection = 'response';
      continue;
    }
    if (firstCell.includes('resolution') && firstCell.includes('compliance')) {
      currentSection = 'resolution';
      continue;
    }
    if (firstCell.includes('engagement') && firstCell.includes('compliance')) {
      currentSection = 'engagement';
      continue;
    }

    // Look for "Grand Total" row - this has the overall compliance percentage
    if (firstCell === 'grand total') {
      // Find the compliance percentage in this row (usually last non-empty column)
      let compliancePercent = null;

      for (let j = row.length - 1; j >= 1; j--) {
        const val = row[j];
        if (val === null || val === undefined || val === '') continue;

        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          // Check if it's a decimal (0-1) or percentage (0-100)
          if (numVal > 0 && numVal <= 1) {
            compliancePercent = numVal * 100; // Convert decimal to percentage
          } else if (numVal > 0 && numVal <= 100) {
            compliancePercent = numVal;
          }
          break;
        }
      }

      if (compliancePercent !== null) {
        if (currentSection === 'response' && response === null) {
          response = compliancePercent;
          console.log(`    Found Response SLA: ${compliancePercent.toFixed(1)}%`);
        } else if (currentSection === 'resolution' && resolution === null) {
          resolution = compliancePercent;
          console.log(`    Found Resolution SLA: ${compliancePercent.toFixed(1)}%`);
        }
      }

      // Also count breaches from this row if available (usually column for "Missed" or "Breached")
      for (let j = 1; j < row.length - 1; j++) {
        const val = parseInt(row[j]);
        if (!isNaN(val) && val > 0 && val < 1000) {
          // This could be a breach/missed count - add to total if in resolution section
          if (currentSection === 'resolution') {
            const headerRow = data[i - 1] || data[i - 2] || [];
            const header = String(headerRow[j] || '').toLowerCase();
            if (header.includes('breach') || header.includes('missed')) {
              breachCount += val;
            }
          }
        }
      }
    }
  }

  return { response, resolution, breachCount };
}

/**
 * Extract availability metrics
 */
function extractAvailability(workbook) {
  const sheet = findSheet(workbook, 'Availability');
  if (!sheet) return { percent: null, outageCount: 0, outageMinutes: 0 };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let percent = null;
  let outageCount = 0;
  let outageMinutes = 0;

  for (const row of data) {
    if (!row) continue;
    const firstCell = String(row[0] || '').toLowerCase();

    // Look for availability percentage
    if (firstCell.includes('availability') || firstCell.includes('%')) {
      for (let i = 1; i < row.length; i++) {
        const val = parseFloat(row[i]);
        if (!isNaN(val) && val <= 100 && val > 90) {
          percent = val;
          break;
        }
      }
    }
  }

  // Check AvailabilityData sheet for outages
  const outageSheet = findSheet(workbook, 'AvailabilityData');
  if (outageSheet) {
    const outageData = XLSX.utils.sheet_to_json(outageSheet, { header: 1 });
    // Count rows (excluding header)
    outageCount = Math.max(0, outageData.length - 2);

    // Sum outage minutes
    for (const row of outageData) {
      if (row) {
        for (const cell of row) {
          const val = parseFloat(cell);
          if (!isNaN(val) && val > 0 && val < 10000) {
            // Assume minutes column
            outageMinutes += val;
          }
        }
      }
    }
  }

  return { percent, outageCount, outageMinutes };
}

/**
 * Extract survey/satisfaction metrics
 */
function extractSurvey(workbook) {
  const sheet = findSheet(workbook, 'Survey', 'Case Survey');
  if (!sheet) return { sent: 0, completed: 0, score: null };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let sent = 0;
  let completed = 0;
  let score = null;
  let totalScore = 0;
  let scoreCount = 0;

  // Find headers
  let headerRow = -1;
  let headers = {};

  for (let i = 0; i < Math.min(3, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('sent') || rowStr.includes('completed') || rowStr.includes('score')) {
      headerRow = i;
      row.forEach((cell, idx) => {
        const cellLower = String(cell || '').toLowerCase();
        if (cellLower.includes('sent')) headers.sent = idx;
        if (cellLower.includes('completed')) headers.completed = idx;
        if (cellLower.includes('score') && !cellLower.includes('%')) headers.score = idx;
      });
      break;
    }
  }

  // Sum values
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    if (headers.sent !== undefined) {
      const val = parseInt(row[headers.sent]);
      if (!isNaN(val)) sent += val;
    }

    if (headers.completed !== undefined) {
      const val = parseInt(row[headers.completed]);
      if (!isNaN(val)) completed += val;
    }

    if (headers.score !== undefined) {
      const val = parseFloat(row[headers.score]);
      if (!isNaN(val) && val > 0 && val <= 5) {
        totalScore += val;
        scoreCount++;
      }
    }
  }

  if (scoreCount > 0) {
    score = totalScore / scoreCount;
  }

  return { sent, completed, score };
}

/**
 * Parse a single SLA report file
 */
function parseSLAReport(clientName, filePath) {
  console.log(`\nParsing: ${path.basename(filePath)}`);

  const workbook = XLSX.readFile(filePath);
  const period = parsePeriodFromFilename(path.basename(filePath));

  console.log(`  Period: ${period.start.toISOString().split('T')[0]} to ${period.end.toISOString().split('T')[0]} (${period.type})`);

  // Extract all metrics
  const volume = extractCaseVolume(workbook);
  const aging = extractAgingCases(workbook);
  const sla = extractSLACompliance(workbook);
  const availability = extractAvailability(workbook);
  const survey = extractSurvey(workbook);

  const metrics = {
    client_name: clientName,
    period_start: period.start.toISOString().split('T')[0],
    period_end: period.end.toISOString().split('T')[0],
    period_type: period.type,

    // Volume
    total_incoming: volume.incoming,
    total_closed: volume.closed,
    backlog: volume.backlog,

    // Priority breakdown
    critical_open: aging.byPriority.critical,
    high_open: aging.byPriority.high,
    moderate_open: aging.byPriority.moderate,
    low_open: aging.byPriority.low,

    // Aging
    aging_0_7d: aging.byAge['0-7d'],
    aging_8_30d: aging.byAge['8-30d'],
    aging_31_60d: aging.byAge['31-60d'],
    aging_61_90d: aging.byAge['61-90d'],
    aging_90d_plus: aging.byAge['90d+'],

    // SLA
    response_sla_percent: sla.response,
    resolution_sla_percent: sla.resolution,
    breach_count: sla.breachCount,

    // Availability
    availability_percent: availability.percent,
    outage_count: availability.outageCount,
    outage_minutes: availability.outageMinutes,

    // Survey
    surveys_sent: survey.sent,
    surveys_completed: survey.completed,
    satisfaction_score: survey.score,

    // Metadata
    source_file: path.basename(filePath),
    imported_by: 'sync-sla-reports.mjs',
  };

  console.log(`  Open cases: ${aging.total} (Critical: ${aging.byPriority.critical}, High: ${aging.byPriority.high})`);
  console.log(`  SLA: Response ${sla.response || 'N/A'}%, Resolution ${sla.resolution || 'N/A'}%`);
  console.log(`  Satisfaction: ${survey.score?.toFixed(2) || 'N/A'}/5.0`);

  return { metrics, cases: aging.cases };
}

/**
 * Sync all SLA reports to database
 */
async function syncAllReports() {
  console.log('='.repeat(60));
  console.log('SLA REPORT SYNC');
  console.log('='.repeat(60));

  let totalSynced = 0;
  let totalCases = 0;

  for (const [clientName, reportDir] of Object.entries(CLIENT_PATHS)) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`CLIENT: ${clientName}`);

    if (!fs.existsSync(reportDir)) {
      console.log(`  ⚠️  Directory not found: ${reportDir}`);
      continue;
    }

    // Find Excel files
    const files = fs.readdirSync(reportDir)
      .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
      .map(f => path.join(reportDir, f));

    if (files.length === 0) {
      console.log('  ⚠️  No Excel files found');
      continue;
    }

    for (const filePath of files) {
      try {
        const { metrics, cases } = parseSLAReport(clientName, filePath);

        // Upsert metrics
        const { error: metricsError } = await supabase
          .from('support_sla_metrics')
          .upsert(metrics, {
            onConflict: 'client_name,period_start,period_end',
          });

        if (metricsError) {
          console.log(`  ❌ Failed to sync metrics: ${metricsError.message}`);
        } else {
          console.log(`  ✅ Metrics synced`);
          totalSynced++;
        }

        // Get the metrics ID for case details
        if (cases.length > 0) {
          const { data: metricsRow } = await supabase
            .from('support_sla_metrics')
            .select('id')
            .eq('client_name', clientName)
            .eq('period_start', metrics.period_start)
            .eq('period_end', metrics.period_end)
            .single();

          if (metricsRow) {
            // Upsert cases
            const casesToInsert = cases.map(c => ({
              ...c,
              metrics_id: metricsRow.id,
              client_name: clientName,
            }));

            const { error: casesError } = await supabase
              .from('support_case_details')
              .upsert(casesToInsert, {
                onConflict: 'client_name,case_number',
              });

            if (casesError) {
              console.log(`  ⚠️  Failed to sync cases: ${casesError.message}`);
            } else {
              console.log(`  ✅ ${cases.length} cases synced`);
              totalCases += cases.length;
            }
          }
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SYNC COMPLETE`);
  console.log(`  Reports synced: ${totalSynced}`);
  console.log(`  Cases synced: ${totalCases}`);
  console.log('='.repeat(60));
}

// Run sync
syncAllReports().catch(console.error);
