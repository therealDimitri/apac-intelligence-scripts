/**
 * Send test Client Support email to Dimitri
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const { generateClientSupportEmail } = await import('../src/lib/emails/email-generator.ts');

async function getClientSupportActions() {
  const { data: actions } = await supabase
    .from('actions')
    .select('*')
    .eq('department_code', 'CLIENT_SUPPORT')
    .order('created_at', { ascending: false });

  const formattedActions = (actions || []).map(a => ({
    id: String(a.id),
    actionId: a.Action_ID || '',
    description: a.Action_Description || '',
    client: a.client || 'General',
    owner: a.Owners || '',
    status: a.Status || 'Open',
    priority: a.Priority || 'Medium',
    dueDate: a.Due_Date || '',
    category: a.Category || '',
  }));

  const today = new Date();
  const overdue = formattedActions.filter(a => {
    if (a.status.toLowerCase() === 'completed') return false;
    if (!a.dueDate) return false;
    const parts = a.dueDate.split('/');
    if (parts.length !== 3) return false;
    const dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dueDate < today;
  }).length;

  return {
    recipientName: 'Stephen',
    actions: formattedActions,
    summary: {
      total: formattedActions.length,
      open: formattedActions.filter(a => a.status.toLowerCase() !== 'completed').length,
      completed: formattedActions.filter(a => a.status.toLowerCase() === 'completed').length,
      overdue,
    },
  };
}

async function main() {
  console.log('📧 Sending Client Support email to Stephen Oster (CC: Dimitri, Dominic)...\n');

  const data = await getClientSupportActions();
  console.log(`Found ${data.summary.total} Client Support actions:`);
  console.log(`  - Open: ${data.summary.open}`);
  console.log(`  - Completed: ${data.summary.completed}`);
  console.log(`  - Overdue: ${data.summary.overdue}\n`);

  const email = generateClientSupportEmail(data);

  const result = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: 'stephen.oster@alterahealth.com',
    cc: ['dimitri.leimonitis@alterahealth.com', 'dominic.wilson-ing@alterahealth.com'],
    subject: email.subject,
    html: email.htmlBody,
  });

  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
  } else {
    console.log(`✅ Sent! (${result.data?.id})`);
  }
}

main().catch(console.error);
