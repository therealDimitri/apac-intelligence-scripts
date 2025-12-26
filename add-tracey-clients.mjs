/**
 * Add missing clients for Tracey Bland to client_segmentation
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MISSING_CLIENTS = [
  'Department of Health - Victoria',
  'Te Whatu Ora Waikato',
];

async function main() {
  console.log('Adding missing clients for Tracey Bland...\n');

  // First get existing record to copy structure
  const { data: existing } = await supabase
    .from('client_segmentation')
    .select('*')
    .eq('cse_name', 'Tracey Bland')
    .limit(1);

  const template = existing?.[0] || {};

  for (const clientName of MISSING_CLIENTS) {
    // Check if already exists
    const { data: check } = await supabase
      .from('client_segmentation')
      .select('id')
      .eq('client_name', clientName)
      .eq('cse_name', 'Tracey Bland')
      .limit(1);

    if (check && check.length > 0) {
      console.log(`⏭️ ${clientName} - already exists`);
      continue;
    }

    const { error } = await supabase
      .from('client_segmentation')
      .insert({
        client_name: clientName,
        cse_name: 'Tracey Bland',
        segment: template.segment || 'Strategic',
        region: template.region || 'APAC',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.log(`❌ ${clientName} - ${error.message}`);
    } else {
      console.log(`✅ ${clientName} - added`);
    }
  }

  // Verify
  console.log('\n=== UPDATED CLIENT LIST ===');
  const { data: updated } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`Total clients: ${updated?.length || 0}`);
  updated?.forEach(c => console.log(`  - ${c.client_name}`));
}

main().catch(console.error);
