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

Detail page extraction ([detail.mjs:9-207](../../ingest/lib/detail.mjs#L9-L207)) uses a
layered fallback strategy:

1. **JSON-LD structured data** — Most stable source for location and industry
   ([detail.mjs:17-40](../../ingest/lib/detail.mjs#L17-L40))
2. **Regex on full page text** — `extractLabeledMoney()` for financial fields
   ([detail.mjs:76-81](../../ingest/lib/detail.mjs#L76-L81))
3. **DOM dt/dd and span selectors** — `findValue()` helper as final fallback
   ([detail.mjs:43-70](../../ingest/lib/detail.mjs#L43-L70))

When adding new extraction fields, follow this same priority order.

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
scrape.mjs (orchestrator)
  ├── lib/browser.mjs    ← lib/delays.mjs
  ├── lib/search.mjs     ← lib/delays.mjs
  ├── lib/detail.mjs     ← lib/parse.mjs, lib/delays.mjs
  ├── lib/supabase.mjs   (standalone — reads env vars)
  ├── lib/checkpoint.mjs (standalone — file I/O)
  └── lib/delays.mjs     (standalone — no deps)
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
