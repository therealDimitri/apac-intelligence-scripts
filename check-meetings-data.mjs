import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.from('unified_meetings').select('*');
if (error) {
  console.log('Error:', error.message);
  process.exit(1);
}

console.log('unified_meetings:');
console.log('  Total meetings:', data.length);

// Date range (filter valid dates)
const validDates = data.map(m => m.start_time).filter(d => d != null).sort();
console.log('  Date range:', validDates[0], 'to', validDates[validDates.length-1]);

// By client
const clients = {};
data.forEach(m => { clients[m.client_name || 'Unknown'] = (clients[m.client_name || 'Unknown'] || 0) + 1; });
console.log('  Clients with meetings:', Object.keys(clients).length);
console.log('  Top 5 clients by meetings:');
Object.entries(clients).sort((a,b) => b[1]-a[1]).slice(0,5).forEach(([c, n]) => console.log('    -', c + ':', n));

// Meeting types
const types = {};
data.forEach(m => { types[m.meeting_type || 'Unknown'] = (types[m.meeting_type || 'Unknown'] || 0) + 1; });
console.log('  Meeting types:', types);

// Status
const statuses = {};
data.forEach(m => { statuses[m.status || 'null'] = (statuses[m.status || 'null'] || 0) + 1; });
console.log('  Status:', statuses);

// Source
const sources = {};
data.forEach(m => { sources[m.source || 'null'] = (sources[m.source || 'null'] || 0) + 1; });
console.log('  Source:', sources);
