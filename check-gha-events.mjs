import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Check segmentation_events for Gippsland Health Alliance (GHA)
  const { data, error } = await supabase
    .from('segmentation_events')
    .select('client_name, event_type_id, event_date, event_year, completed')
    .eq('client_name', 'Gippsland Health Alliance (GHA)')
    .eq('event_year', 2025)
    .order('event_date');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total events for GHA 2025:', data.length);
  console.log('\nBreakdown by completed status:');
  const completed = data.filter(e => e.completed === true);
  const notCompleted = data.filter(e => e.completed !== true);
  console.log('  Completed (true):', completed.length);
  console.log('  Not completed (false/null):', notCompleted.length);

  if (completed.length > 0) {
    console.log('\nCompleted events by month:');
    const byMonth = {};
    completed.forEach(e => {
      const month = e.event_date.slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + 1;
    });
    Object.keys(byMonth).sort().forEach(m => {
      console.log(`  ${m}: ${byMonth[m]} events`);
    });
  }

  if (notCompleted.length > 0) {
    console.log('\nNOT completed events (first 10):');
    notCompleted.slice(0, 10).forEach(e => {
      console.log(`  ${e.event_date} | completed=${e.completed}`);
    });
  }
}

run();
