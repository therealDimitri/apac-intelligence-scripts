## Project: apac-intelligence-scripts

Utility scripts submodule for the APAC Intelligence application. No npm install, no build, no tests, no deployment.

## OneDrive Path Gotchas
- Many scripts hardcode OneDrive paths to Excel files — these break when OneDrive is reconfigured or OS is re-imaged
- Correct BURC base: `/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC`
- Audit all paths: `grep -r "OneDrive" --include="*.mjs" .`
- The `General/` segment in `APAC Leadership Team - General/` is frequently dropped — always verify

## Critical: Environment Loading

Scripts load `.env.local` from the **parent directory**, not this directory:

```javascript
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
```

When running scripts, always run from the parent `apac-intelligence-v2` directory:

```bash
# Correct
cd /path/to/apac-intelligence-v2
node scripts/introspect-database-schema.mjs

# Wrong - will fail to find env vars
cd /path/to/apac-intelligence-scripts
node introspect-database-schema.mjs
```

## Output Paths

Scripts write to the **parent repository**, not this directory:

- `docs/database-schema.md` — Schema documentation
- `docs/database-schema.json` — Machine-readable schema
- `src/types/database.generated.ts` — TypeScript types

## Common Patterns

### Supabase Client Setup

```javascript
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
```

### ESM Module Format

All scripts use `.mjs` extension and ES modules syntax:

- `import` instead of `require`
- `__dirname` must be constructed: `path.dirname(fileURLToPath(import.meta.url))`
- Top-level `await` is supported

## Script Categories

| Prefix | Purpose | Destructive? |
|--------|---------|--------------|
| `apply-` | Database migrations | Yes |
| `sync-` | Data synchronisation | Usually |
| `fix-` | Data corrections | Yes |
| `add-` | Add data/columns | Yes |
| `import-` | Bulk imports | Yes |
| `analyse-`/`analyze-` | Read-only analysis | No |
| `introspect-` | Schema inspection | No |
| `validate-` | Validation checks | No |

## Key Scripts

- `introspect-database-schema.mjs` — Regenerates `docs/database-schema.md` from live DB
- `validate-database-columns.mjs` — Validates all queries in `src/` match schema

## Gotchas

- Scripts assume they're in a `scripts/` subdirectory of the main app
- Service role key required (anon key won't work due to RLS)
- Some scripts have hardcoded table lists that may need updating
- No `package.json` here — dependencies come from parent `node_modules/`

## Autonomous Workflow

For this repo: Edit → Commit → Push. No build or test steps required.

## Tender Scraper

- **Location**: `tender-scraper/` directory
- **Run single portal**: `PORTALS=austender npx tsx tender-scraper/index.ts`
- **Debug screenshots**: Saved to `tender-scraper/screenshots/` with timestamps
- **maxPages config**: In `tender-scraper/types.ts` - increase for historical data (default: 50 for AusTender)
- **Healthcare filtering**: Patterns in `scrapers/austender.ts` match agency names and titles
