/**
 * Check actions table structure for Client Support filtering
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Get sample actions to see structure
  const { data: actions } = await supabase
    .from('actions')
    .select('*')
    .limit(5);

  console.log('=== SAMPLE ACTION STRUCTURE ===');
  if (actions && actions.length > 0) {
    console.log('Columns:', Object.keys(actions[0]).join(', '));
    console.log('\nSample action:');
    console.log(JSON.stringify(actions[0], null, 2));
  }

  // Check for Category values
  console.log('\n=== UNIQUE CATEGORY VALUES ===');
  const { data: categories } = await supabase
    .from('actions')
    .select('Category')
    .not('Category', 'is', null);

  const uniqueCategories = [...new Set(categories?.map(c => c.Category))];
  uniqueCategories.forEach(c => console.log(`  - ${c}`));

  // Check for Client Support specifically
  console.log('\n=== CLIENT SUPPORT ACTIONS ===');
  const { data: csActions } = await supabase
    .from('actions')
    .select('Action_ID, Action_Description, Owners, Status, Category, client')
    .eq('Category', 'Client Support');

  console.log(`Found ${csActions?.length || 0} Client Support actions`);
  csActions?.slice(0, 3).forEach(a => {
    console.log(`  - [${a.Status}] ${a.Action_Description?.substring(0, 60)}...`);
    console.log(`    Owner: ${a.Owners}, Client: ${a.client}`);
  });
}

main().catch(console.error);
