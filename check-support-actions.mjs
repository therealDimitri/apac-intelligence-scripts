/**
 * Check for Support-related actions
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check for actions with "Support" in Category
  console.log('=== ACTIONS WITH "SUPPORT" IN CATEGORY ===');
  const { data: supportActions } = await supabase
    .from('actions')
    .select('Action_ID, Action_Description, Owners, Status, Category, client')
    .ilike('Category', '%support%');

  console.log(`Found ${supportActions?.length || 0} actions with "Support" in Category`);
  supportActions?.forEach(a => {
    console.log(`\n  Category: ${a.Category}`);
    console.log(`  Action: ${a.Action_Description?.substring(0, 80)}`);
    console.log(`  Owner: ${a.Owners}, Client: ${a.client}, Status: ${a.Status}`);
  });

  // Check department_code values
  console.log('\n\n=== DEPARTMENT CODES ===');
  const { data: depts } = await supabase
    .from('actions')
    .select('department_code')
    .not('department_code', 'is', null);

  const uniqueDepts = [...new Set(depts?.map(d => d.department_code))];
  console.log('Unique department codes:', uniqueDepts.length ? uniqueDepts.join(', ') : 'None found');

  // Check Content_Topic values
  console.log('\n=== CONTENT_TOPIC VALUES ===');
  const { data: topics } = await supabase
    .from('actions')
    .select('Content_Topic')
    .not('Content_Topic', 'is', null);

  const uniqueTopics = [...new Set(topics?.map(t => t.Content_Topic))];
  uniqueTopics.forEach(t => console.log(`  - ${t}`));
}

main().catch(console.error);
