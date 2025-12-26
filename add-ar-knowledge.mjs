import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://usoyxsunetvxdjdglkmn.supabase.co'
const supabaseKey = '***REMOVED***'

const supabase = createClient(supabaseUrl, supabaseKey)

const knowledgeEntries = [
  {
    category: 'data_sources',
    knowledge_key: 'aged_receivables',
    title: 'Aged Receivables Data Source',
    content: `## Aged Receivables Integration

The system integrates with the Invoice Tracker application to provide real-time aged receivables data.

### Available Data
- **Portfolio Totals**: Total USD receivables, current vs overdue breakdown
- **Client-level Aging**: Individual client receivables organised by aging buckets
- **Risk Assessment**: Automatic risk level calculation per client

### Aging Buckets
- Current (not yet due)
- 31-60 days overdue
- 61-90 days overdue
- 91-120 days overdue
- 121-180 days overdue
- 181-270 days overdue
- 271-365 days overdue
- Over 365 days overdue

### Risk Levels
- **Critical**: Has invoices >271 days OR >50% overdue ratio
- **High**: Has invoices 121-270 days OR >30% overdue ratio
- **Medium**: Has invoices 61-120 days OR >15% overdue ratio
- **Low**: Only current or <31 days overdue invoices

### How to Access
Use the Aged Receivables card on the dashboard or client profile pages. Data refreshes every 5 minutes and shows amounts converted to USD.`,
    priority: 85,
    is_active: true,
    metadata: { source: 'invoice-tracker', api_endpoint: '/api/invoice-tracker/aging' }
  },
  {
    category: 'formulas',
    knowledge_key: 'overdue_ratio',
    title: 'Overdue Ratio Calculation',
    content: `## Overdue Ratio Formula

**Overdue Ratio** = (Total Receivables - Current) / Total Receivables × 100

### Components
- **Total Receivables**: Sum of all outstanding invoices in USD
- **Current**: Invoices not yet past due date
- **Overdue**: All invoices past their due date (sum of all aging buckets except Current)

### Example
If a client has:
- Total Receivables: $100,000
- Current: $60,000
- Overdue: $40,000

Overdue Ratio = ($100,000 - $60,000) / $100,000 = 40%

### Interpretation
- 0-15%: Healthy collection rate
- 15-30%: Monitor closely
- 30-50%: Action required
- >50%: Critical attention needed`,
    priority: 80,
    is_active: true,
    metadata: { formula_type: 'ratio', unit: 'percentage' }
  },
  {
    category: 'business_rules',
    knowledge_key: 'ar_risk_thresholds',
    title: 'AR Risk Thresholds and Escalation',
    content: `## Aged Receivables Risk Management

### Automatic Risk Classification
The system automatically assigns risk levels based on aging and amounts:

| Risk Level | Aging Criteria | Overdue Ratio |
|------------|---------------|---------------|
| Critical   | Any invoice >271 days | OR >50% |
| High       | Any invoice 121-270 days | OR >30% |
| Medium     | Any invoice 61-120 days | OR >15% |
| Low        | All invoices <61 days | AND <15% |

### Recommended Actions by Risk Level

**Critical Risk**
- Immediate CSM escalation
- Review contract terms
- Consider collection procedures
- Executive engagement may be required

**High Risk**
- Weekly follow-up calls
- Escalate to finance team
- Review payment plan options
- Document all interactions

**Medium Risk**
- Bi-weekly check-ins
- Send payment reminders
- Monitor for escalation
- Note in client profile

**Low Risk**
- Standard invoice follow-up
- Monthly account review
- No special action required`,
    priority: 75,
    is_active: true,
    metadata: { applies_to: 'client_management' }
  },
  {
    category: 'definitions',
    knowledge_key: 'working_capital_terms',
    title: 'Working Capital Terminology',
    content: `## Working Capital Definitions

### Key Terms

**Accounts Receivable (AR)**
Outstanding invoices owed to the company by clients. Represents money earned but not yet collected.

**Aging Report**
A report that categorises receivables by the length of time an invoice has been outstanding. Used to identify collection issues.

**Days Sales Outstanding (DSO)**
Average number of days to collect payment after a sale. Lower is better.

**Current vs Overdue**
- **Current**: Invoice due date has not yet passed
- **Overdue**: Invoice due date has passed (also called "past due")

**Bad Debt**
Receivables deemed uncollectible. Typically considered after 365+ days overdue.

**Invoice Tracker**
The external system that manages invoice data, payment tracking, and generates aging reports for APAC clients.`,
    priority: 70,
    is_active: true,
    metadata: { topic: 'finance' }
  }
]

async function addKnowledge() {
  console.log('Adding aged receivables knowledge entries...\n')
  
  for (const entry of knowledgeEntries) {
    const { data, error } = await supabase
      .from('chasen_knowledge')
      .upsert({
        ...entry,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'category,knowledge_key'
      })
      .select()
    
    if (error) {
      console.error(`❌ Failed to add ${entry.knowledge_key}:`, error.message)
    } else {
      console.log(`✅ Added: ${entry.title}`)
    }
  }
  
  console.log('\nDone!')
}

addKnowledge()
