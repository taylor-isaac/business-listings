# Architectural Patterns

## Three-Phase Pipeline

The scraper follows a strict Collect → Extract → Report flow ([scrape.mjs:43-121](../../ingest/scrape.mjs#L43-L121)).
Each phase completes before the next begins. This separation lets each phase be
retried independently and keeps concerns isolated across modules.

## Checkpoint-Based Fault Tolerance

State is persisted to `.checkpoint.json` after every significant operation
([checkpoint.mjs:31-33](../../ingest/lib/checkpoint.mjs#L31-L33)). The checkpoint tracks:
- `phase`: current pipeline phase (`"collect"` | `"extract"` | `"done"`)
- `collectedUrls`: all discovered listing URLs
- `completedUrls`: URLs that have been successfully processed

On restart, the pipeline skips completed work ([scrape.mjs:45-56](../../ingest/scrape.mjs#L45-L56)).
On success, the checkpoint is cleared ([scrape.mjs:120](../../ingest/scrape.mjs#L120)).
On fatal error, the checkpoint is saved so the next run resumes
([scrape.mjs:122-126](../../ingest/scrape.mjs#L122-L126)).

## Retry with Linear Backoff

The `retry()` wrapper ([scrape.mjs:11-31](../../ingest/scrape.mjs#L11-L31)) retries up to 3 times
with linear backoff (`attempt * 5s`). CAPTCHA/403 detection triggers a 60-second
wait before retry. This pattern wraps both URL collection and detail extraction.

## Batch Upsert with Buffer

Rows accumulate in an in-memory buffer and flush to Supabase every 50 rows
([scrape.mjs:89-95](../../ingest/scrape.mjs#L89-L95), [supabase.mjs:20-40](../../ingest/lib/supabase.mjs#L20-L40)).
Remaining rows flush after the loop ([scrape.mjs:107-111](../../ingest/scrape.mjs#L107-L111)).
Upsert uses `onConflict: "source,source_listing_id"` as the composite key.

## Anti-Bot Detection Strategy

Multiple techniques are layered across files:

- **Persistent browser profile**: Cookies and session state survive across runs
  ([browser.mjs:19-28](../../ingest/lib/browser.mjs#L19-L28))
- **Automation flag disabled**: `--disable-blink-features=AutomationControlled`
  ([browser.mjs:23](../../ingest/lib/browser.mjs#L23))
- **Session warmup**: Homepage visit before any scraping to establish cookies
  ([browser.mjs:33-37](../../ingest/lib/browser.mjs#L33-L37))
- **Human-like scrolling**: Random scroll increments (200-600px), 2-5 times per page
  ([delays.mjs:12-19](../../ingest/lib/delays.mjs#L12-L19))
- **Randomized delays**: Detail pages 2-5s, search pages 3-7s, long pauses every 10 pages
  ([delays.mjs:22-31](../../ingest/lib/delays.mjs#L22-L31))

## Multi-Source Data Extraction

Detail page extraction ([detail.mjs](../../ingest/lib/detail.mjs)) uses a
layered fallback strategy:

1. **JSON-LD structured data** — Most stable source for location and industry
2. **Regex on full page text** — `extractLabeledMoney()` for financial fields
3. **DOM dt/dd and span selectors** — `findValue()` helper as final fallback
   - Searches: `.listingProfile_details span`, `.details-item`, `.bfsListing_headerRow span`,
     `.price span`, `[class*='financial'] span`, `[class*='Financial'] span`

When adding new extraction fields, follow this same priority order.

### Common Extraction Pitfalls

These bugs have been encountered and fixed — watch for them when adding new patterns:

- **Parenthetical annotations**: BizBuySell often uses labels like `"Cash Flow (SDE): $120,000"`.
  Regex must skip `(...)` between label and value. The `extractLabeledMoney()` function handles
  this with `\)?(?:\s*\([^)]*\))?` after the label.
- **Colon separators**: Structured fields render as `"Established: 1930"` in innerText. Use
  `[:\s]+` instead of `\s+` after keywords to match both whitespace and colons.
- **Noun vs adjective word forms**: "SBA pre-approval" (noun) vs "SBA pre-approved" (adjective).
  Use stem matching like `(?:qualifi|approv)\w*` instead of exact words.
- **K/M suffixes**: Values like `"$178K"` or `"$1.2M"` must be detected and multiplied.
  Both `extractLabeledMoney()` and `parseMoneyToNumber()` handle this.
- **Connector words**: Values like `"SDE of ~$178K"` have words between label and dollar sign.
  The regex allows optional `(?:of|is|was|at)` between label and value.
- **Description vs structured fields**: Some values only appear in the page's structured
  DOM elements (sidebar/header), not in `description_text`. If a value is missing from the stored
  description, re-scraping is the only fix. Check the DB `description_text` first before assuming
  a regex bug.
- **findValue() parent container collision**: `findValue()` uses `span.closest("div, li, tr")`
  then `parent.querySelector(".price, ...")` to find value elements. If a label span (e.g.
  "Established:") shares a parent with a `.price` container, it can return the wrong value
  (e.g. "$1,999,950" instead of "1999"). Guard against this by rejecting money-formatted
  values where they don't make sense (e.g. `if (/^\$/.test(result)) result = null`).
- **Structured fields not reaching signals.mjs**: BizBuySell puts "Reason for Selling" in
  dt/dd fields, not in `description_text`. Since `signals.mjs` only searches description text,
  these must be appended to `description_text` during extraction in `detail.mjs`.
- **Health pattern variants**: Reason-for-sale "health" regex must cover all forms:
  `health\s+(reasons?|issues?|concerns?|conditions?|problems?)`. Real listings use all of these.

## Pattern-Based Signal Detection

Owner involvement and recurring revenue are detected via regex pattern arrays
applied to listing description text:

- **Owner involvement**: 9 patterns mapping to labels like `"absentee owner"`,
  `"semi-absentee"`, `"manager run"` ([detail.mjs:128-145](../../ingest/lib/detail.mjs#L128-L145))
- **Recurring revenue**: Single regex with 10+ alternations for keywords like
  `"subscription"`, `"mrr"`, `"retainer"` ([detail.mjs:148-149](../../ingest/lib/detail.mjs#L148-L149))

When adding new signals, follow this same pattern: define regex patterns, apply to
description text, store as a column on the listing row.

## Module Dependency Flow

```
scrape.mjs (orchestrator — extracts + scores inline)
  ├── lib/browser.mjs    ← lib/delays.mjs
  ├── lib/search.mjs     ← lib/delays.mjs
  ├── lib/detail.mjs     ← lib/parse.mjs, lib/delays.mjs
  ├── lib/signals.mjs    (description-based signal extraction)
  ├── lib/weights.mjs    (signal weights + scoring algorithm)
  ├── lib/supabase.mjs   (standalone — reads env vars)
  ├── lib/checkpoint.mjs (standalone — file I/O)
  └── lib/delays.mjs     (standalone — no deps)

score.mjs (standalone rescorer)
  ├── lib/signals.mjs
  ├── lib/weights.mjs
  └── lib/supabase.mjs

debug-scrape.mjs (single-URL debugger)
  ├── lib/browser.mjs
  ├── lib/detail.mjs
  ├── lib/signals.mjs
  └── lib/delays.mjs
```

All modules export pure async functions. The Playwright `page` object is passed
as a parameter (not imported globally), keeping modules testable and decoupled.

## Error Handling Conventions

- **Network/scraping errors**: Logged and continued — one failed listing doesn't
  stop the pipeline ([scrape.mjs:80-86](../../ingest/scrape.mjs#L80-L86))
- **Database errors**: Thrown immediately — batch integrity is non-negotiable
  ([supabase.mjs:30-33](../../ingest/lib/supabase.mjs#L30-L33))
- **Fatal errors**: Checkpoint saved, exit code 1
  ([scrape.mjs:122-126](../../ingest/scrape.mjs#L122-L126))

## Console Logging Conventions

All log messages use bracketed prefixes to identify their source module:
`[browser]`, `[search]`, `[extract]`, `[supabase]`, `[checkpoint]`, `[retry]`.
Follow this convention when adding new log statements.
