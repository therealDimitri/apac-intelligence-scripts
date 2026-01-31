## Project: apac-intelligence-scripts

Utility scripts submodule for the APAC Intelligence application. No npm install, no build, no tests, no deployment.

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
