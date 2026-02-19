# Ingestion Pipeline

Daily scraper that collects business-for-sale listings from BizBuySell and upserts
them into the Supabase `listings` table. Targets businesses with $750K-$1M gross revenue.

## Tech Stack

- **Runtime**: Node.js 20 (ES modules — all files use `.mjs`)
- **Browser automation**: Playwright + playwright-extra + puppeteer-extra-plugin-stealth
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **CI/CD**: GitHub Actions — daily at 01:00 UTC + manual dispatch

## Project Structure

```
scrape.mjs                # Main entry — orchestrates 3-phase pipeline
upsert-test.mjs           # Standalone DB connectivity smoke test
lib/
  browser.mjs             # Playwright launch with persistent Chrome profile
  search.mjs              # Paginated search result collection
  detail.mjs              # Detail page DOM + JSON-LD data extraction
  parse.mjs               # URL ID extraction, money string parsing
  supabase.mjs            # Batch upsert to Supabase (50-row batches)
  checkpoint.mjs          # Checkpoint save/load/clear for fault recovery
  delays.mjs              # Rate limiting — random delays, human scroll sim
```

## Commands

All commands run from this (`ingest/`) directory:

```bash
npm install                 # Install dependencies
node scrape.mjs             # Run full pipeline (requires env vars)
node upsert-test.mjs        # Smoke test — fetches one listing, upserts to DB
```

## Environment Variables

In addition to the shared variables in the root CLAUDE.md:

| Variable | Required | Purpose |
|----------|----------|---------|
| `HEADED` | No | Set to `1` to show browser window for debugging |

## Pipeline Phases

The scraper runs three sequential phases (see [scrape.mjs:43-121](scrape.mjs#L43-L121)):

1. **Collect** — Paginates search results, deduplicates listing URLs
2. **Extract** — Visits each detail page, parses financial data, upserts in batches
3. **Report** — Logs summary stats, clears checkpoint

Checkpoint file (`.checkpoint.json`) enables resumption if the pipeline fails mid-run.

## Additional Documentation

- [../.claude/docs/architectural_patterns.md](../.claude/docs/architectural_patterns.md) — Pipeline architecture, retry/checkpoint patterns, anti-bot strategies, data extraction conventions
