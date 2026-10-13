# Vanilla Steel · Listing Intelligence (Route B)

Static frontend (`public/`) + one Netlify Function (`netlify/functions/claude.mjs`) that holds the Anthropic API key.
No build step. The browser never sees the key.

## Deploy (≈10 minutes)

1. Create a GitHub repo with this folder (or use `netlify deploy` from the CLI).
2. In Netlify: **Add new site → Import from Git**. Build command: *none*. Publish directory: `public`.
3. Site settings → **Environment variables**:
   - `ANTHROPIC_API_KEY` = your key (required)
   - `CLAUDE_MODEL_DEFAULT` = `claude-sonnet-5-5` (extraction, equivalents)  — check current model ids in the Anthropic docs
   - `CLAUDE_MODEL_QUICK` = `claude-haiku-5-5` (instruction → rule)
   - `APP_ACCESS_TOKEN` = any long random string (recommended; the site URL is public). Users paste it once in Settings.
   - `RATE_LIMIT_PER_MIN` = `60`
4. Deploy. Open the site → sidebar shows **AI: Claude via secure proxy (model)**. `/api/claude/health` shows usage counters.

Local: `npm i -g netlify-cli`, copy `.env.example` → `.env`, run `netlify dev`.

## What Claude does now
- **AI extraction pass** (automatic after *Approve Mapping & Generate*, or the *Run AI extraction* button): every unique description the rules could not fully resolve is sent in batches of 12 with the catalog value lists; returned values are accepted only if they exist in the catalog and land as **AI-inferred** (warning → needs review). Candidates for unknown grades/coatings carry a match type.
- Instruction panel → structured rules (quick model).
- *Ask Claude* on a row / in *Resolve unknowns* → EN-equivalent and coating candidates with reasoning and references.

Rules, decimals, units and form classification stay deterministic (`public/engine.js`) — Claude never touches them.

## Project layout
```
public/index.html   markup            public/engine.js  deterministic transformation engine
public/app.js       UI + workflow     public/ai.js      Claude adapter + AI extraction pass
public/catalog.js   embedded catalog  netlify/functions/claude.mjs  secure proxy
test/engine.test.cjs  123 engine checks (npm test)   test/function.test.mjs  proxy unit test
test/mockserver.py + test/e2e.py      browser end-to-end with a mock Claude
```

## Updating the catalog
`public/catalog.js` is generated from `Listings_Catalog.xlsx` (Validation sheet). Regenerate when the catalog changes; user additions made in the app stay in the browser until a shared database is added (Phase 2).

## Next (Phase 2)
Shared persistence for rules/aliases/history (Supabase), Gmail ingestion of listings@, Slack posting, PDF/image extraction via the same proxy, roles.
