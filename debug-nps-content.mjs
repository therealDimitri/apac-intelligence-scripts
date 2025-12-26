#!/usr/bin/env node
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
  console.log('=== INVESTIGATING NPS RESPONSE CONTENT ===\n');

  // Get all Grampians and Gippsland responses with their feedback
  const { data } = await supabase
    .from('nps_responses')
    .select('id, client_name, score, feedback, what_we_do_well, areas_to_improve, respondent_name, respondent_email')
    .or('client_name.ilike.%Grampians%,client_name.ilike.%Gippsland%')
    .order('client_name, id');

  // Group by client
  const grouped = {};
  data?.forEach(r => {
    if (!grouped[r.client_name]) grouped[r.client_name] = [];
    grouped[r.client_name].push(r);
  });

  Object.entries(grouped).forEach(([name, responses]) => {
    console.log('='.repeat(60));
    console.log(`${name} (${responses.length} responses)`);
    console.log('='.repeat(60));

    responses.forEach(r => {
      console.log('');
      console.log(`ID: ${r.id} | Score: ${r.score}`);
      console.log(`Respondent: ${r.respondent_name || 'N/A'}`);
      console.log(`Email: ${r.respondent_email || 'N/A'}`);
      if (r.feedback) console.log(`Feedback: ${r.feedback.substring(0, 150)}`);
      if (r.what_we_do_well) console.log(`Do Well: ${r.what_we_do_well.substring(0, 150)}`);
      if (r.areas_to_improve) console.log(`Improve: ${r.areas_to_improve.substring(0, 150)}`);
    });
    console.log('');
  });
}

investigate().catch(console.error);
