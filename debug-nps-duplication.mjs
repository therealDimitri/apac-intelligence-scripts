#!/usr/bin/env node
/**
 * Debug NPS duplication issue - Grampians Health vs Grampians Health Alliance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('=== NPS DATA INVESTIGATION ===\n');

  // Check nps_responses for Grampians and Gippsland
  const { data: nps } = await supabase
    .from('nps_responses')
    .select('client_name, score, response_date, respondent_name')
    .or('client_name.ilike.%Grampians%,client_name.ilike.%Gippsland%')
    .order('client_name');

  console.log('NPS Responses matching Grampians or Gippsland:');
  console.log('');

  // Group by client_name
  const grouped = {};
  nps?.forEach(r => {
    if (!grouped[r.client_name]) {
      grouped[r.client_name] = [];
    }
    grouped[r.client_name].push(r);
  });

  Object.entries(grouped).forEach(([name, responses]) => {
    console.log(`${name} (${responses.length} responses):`);
    responses.slice(0, 3).forEach(r => {
      console.log(`  - Score: ${r.score} | Date: ${r.response_date} | Respondent: ${(r.respondent_name || '').substring(0, 30)}`);
    });
    if (responses.length > 3) console.log(`  ... and ${responses.length - 3} more`);
    console.log('');
  });

  // Check nps_clients
  console.log('=== NPS_CLIENTS TABLE ===\n');
  const { data: clients } = await supabase
    .from('nps_clients')
    .select('client_name, segment')
    .or('client_name.ilike.%Grampians%,client_name.ilike.%Gippsland%');

  clients?.forEach(c => {
    console.log(`- ${c.client_name} | ${c.segment}`);
  });

  // Check all unique client names in nps_responses
  console.log('\n=== ALL UNIQUE CLIENT NAMES IN NPS_RESPONSES ===\n');
  const { data: allNames } = await supabase
    .from('nps_responses')
    .select('client_name')
    .order('client_name');

  const uniqueNames = [...new Set(allNames?.map(r => r.client_name))];
  uniqueNames.forEach(name => {
    if (name.includes('Grampians') || name.includes('Gippsland') || name.includes('GHA')) {
      console.log(`>>> ${name}`);
    }
  });
}

investigate().catch(console.error);
