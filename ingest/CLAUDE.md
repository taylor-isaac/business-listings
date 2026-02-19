# Ingestion Pipeline

Daily scraper that collects business-for-sale listings from BizBuySell and upserts
them into the Supabase `listings` table. Targets businesses with $750K-$1M gross revenue.

## Tech Stack

- **Runtime**: Node.js 20 (ES modules — all files use `.mjs`)
- **Browser automation**: Playwright + playwright-extra + puppeteer-extra-plugin-stealth
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **CI/CD**: GitHub Actions — manual dispatch only

## Project Structure

```
scrape.mjs                # Main entry — orchestrates 3-phase pipeline + inline scoring
score.mjs                 # Standalone scorer — rescores all listings from DB
upsert-test.mjs           # Standalone DB connectivity smoke test
lib/
  browser.mjs             # Playwright launch with persistent Chrome profile
  search.mjs              # Paginated search result collection
  detail.mjs              # Detail page DOM + JSON-LD data extraction
  parse.mjs               # URL ID extraction, money string parsing
  supabase.mjs            # Batch upsert, fetch listings, save scores
  checkpoint.mjs          # Checkpoint save/load/clear for fault recovery
  delays.mjs              # Rate limiting — random delays, human scroll sim
  signals.mjs             # Description-based signal extraction (regex patterns)
  weights.mjs             # Configurable signal weights + scoring algorithm (0-100)
```

## Commands

All commands run from this (`ingest/`) directory:

```bash
npm install                 # Install dependencies
npm run scrape              # Run full scrape pipeline (extracts + scores new listings)
npm run score               # Rescore all existing listings (after weight changes)
```

**IMPORTANT: Do NOT run `upsert-test.mjs` or any plain HTTP fetch against BizBuySell. The site blocks non-browser requests with 403 errors. All scraping must go through Playwright via `scrape.mjs`. Only use `node --env-file=.env analyze-listings.mjs` to verify database contents.**

## Environment Variables

In addition to the shared variables in the root CLAUDE.md:

| Variable | Required | Purpose |
|----------|----------|---------|
| `HEADED` | No | Set to `1` to show browser window for debugging |

## Pipeline Phases

The scraper runs three sequential phases (see [scrape.mjs:43-121](scrape.mjs#L43-L121)):

1. **Collect** — Paginates search results, deduplicates listing URLs
2. **Extract** — Visits each detail page, parses financial data, scores inline, upserts in batches
3. **Report** — Logs summary stats, clears checkpoint

Checkpoint file (`.checkpoint.json`) enables resumption if the pipeline fails mid-run.

## Scoring System (v2)

Signal extraction (`lib/signals.mjs`) parses `description_text` with regex patterns to detect:
growth potential, reason for sale, customer concentration risk, lease terms. Also computes
SDE multiple, data completeness, description quality, and price/revenue ratio from structured fields.

Weights and scoring (`lib/weights.mjs`) normalizes each signal to 0–1, applies configurable weights,
and produces a 0–100 index score. Null signals are excluded from the weighted average.
**v2 key change:** SDE multiple and data completeness return 0.0 (not null) when earnings data
is missing — they stay in the denominator and actively penalize incomplete listings.

**Hybrid database design:** `index_score` lives on `listings` for sorting; full signal breakdown
is stored as JSONB in the `listing_scores` table. This avoids schema changes when adding signals.

**Standalone rescoring:** `npm run score` reads all listings from DB, re-extracts signals from
stored `description_text`, recalculates scores with current weights, and writes to both tables.
Note: rescoring only re-extracts description-based signals — it does NOT re-extract structured
fields like `cash_flow_sde` or `num_years` (those require re-scraping the live page).

## Data Extraction Conventions

Financial fields are extracted in `lib/detail.mjs` using `extractLabeledMoney()` which searches
the full page text (`document.body.innerText`) with regex, falling back to DOM-based `findValue()`.

**Known extraction patterns handled:**
- Standard: `"Cash Flow: $178,000"`, `"SDE: ~$178K"`, `"Revenue $1.2M"`
- Parenthetical annotations: `"Cash Flow (SDE): $120,000"`, `"Seller's Discretionary Earnings (SDE): ~$290,000"`
- Connector words: `"SDE of ~$178K"`, `"SDE is $200,000"`
- K/M suffixes: `"$178K"` → 178,000, `"$1.2M"` → 1,200,000
- Colon-separated structured fields: `"Established: 1930"`, `"Year Established: 1984"`
- Standalone "since" patterns: `"since the 1930s"`, `"since 1984"`
- SBA all word forms: `"SBA pre-approved"`, `"SBA pre-approval"`, `"SBA pre-qualification"`

**When fixing extraction bugs:** The root cause is almost always that the regex doesn't account
for a formatting variant on the live page. Check the stored `description_text` in Supabase first —
if the value is there, the regex can be fixed. If not, the value is only in structured page fields
and requires re-scraping.

## Additional Documentation

- [../.claude/docs/architectural_patterns.md](../.claude/docs/architectural_patterns.md) — Pipeline architecture, retry/checkpoint patterns, anti-bot strategies, data extraction conventions
