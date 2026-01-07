import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDuplicates() {
  // IDs of the APAC entries that appear to be duplicates of client-specific entries
  const duplicateIds = [
    '46c3b472-252c-40cd-8d1c-d44081606499', // APAC ECG Worklist Integration
    '36cce504-d1b0-49ed-b3bc-1dd8e05d304e', // APAC Expansion Pack Sub
    'cdce3436-f089-446e-b319-33960f7d3e76', // APAC Sunrise AI Scribe Connector
  ];

  console.log('Marking duplicate APAC entries as inactive...');
  console.log('');

  for (const id of duplicateIds) {
    const { data, error } = await supabase
      .from('burc_pipeline_detail')
      .update({
        pipeline_status: 'duplicate_archived',
        last_updated: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating', id, ':', error);
    } else if (data && data.length > 0) {
      console.log('Archived:', data[0].client_name, '-', data[0].deal_name, '($' + (data[0].net_booking || 0).toLocaleString() + ')');
    }
  }

  console.log('');
  console.log('Done! Duplicates have been archived.');

  // Recalculate totals
  const { data: remaining, error: fetchError } = await supabase
    .from('burc_pipeline_detail')
    .select('net_booking')
    .eq('fiscal_year', 2026)
    .eq('pipeline_status', 'active');

  if (fetchError) {
    console.error('Error fetching remaining:', fetchError);
    return;
  }

  const newTotal = remaining.reduce((sum, d) => sum + (d.net_booking || 0), 0);
  console.log('');
  console.log('New total pipeline value: $' + newTotal.toLocaleString());
  console.log('Items remaining:', remaining.length);
}

fixDuplicates();
