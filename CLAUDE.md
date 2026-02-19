# Business Listings Platform

Monorepo with two components that share a Supabase `listings` table:

- **`ingest/`** — Daily scraper that collects business-for-sale listings from BizBuySell
- **`website/`** — Next.js frontend that displays listings to users

**IMPORTANT: When working on a new feature or bug fix, always create a git branch first. Work on changes in that branch for the remainder of the session.**

## Project Goals

**Vision:** Aggregate business-for-sale listings daily, extract and score key signals, and surface the best opportunities on a ranked website.

**Filter criteria:**
- Gross revenue range: $750,000–$1,000,000
- Industry: Cleaning businesses (current), expanding to all service businesses once the scraper is stable
- Source: BizBuySell (current), expanding to multiple listing sites (BizQuest, BusinessBroker.net, etc.)

**Scoring & ranking:**
- Each listing gets an **index score** based on weighted signals
- Signal weights are defined in a **configurable weights file** (not hardcoded) so they can be tuned over time
- Key signals (not exhaustive — still being refined):
  - Cash flow / SDE multiple (price relative to earnings)
  - Absentee / low owner involvement
  - Recurring revenue (contracts, subscriptions)
  - Data completeness (penalize listings missing key financials)
- The scoring model is evolving — expect new signals to be added as patterns emerge

**Website experience:**
- Hybrid: ranked list with filtering/sorting capabilities
- Listings sorted by index score by default
- Key metrics visible at a glance (price, revenue, cash flow, score)
- Ability to filter/sort by individual signals

**Workflow:**
- Scraper is run manually — triggered by the user to check for new listings
- New listings are upserted into Supabase (deduped by source + listing ID)
- Signals are extracted and scored
- Website reads from the scored database

## Shared Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for DB writes |

GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Database Schema

Table: `listings` — upsert conflict key: `(source, source_listing_id)`

Key columns: `source`, `source_listing_id`, `url`, `state`, `industry`,
`asking_price`, `cash_flow_sde`, `gross_revenue`, `ebitda`, `inventory`, `ffe`,
`num_employees`, `num_years`, `description_text`, `owner_involvement`,
`has_recurring_revenue`, `content_hash`, `is_active`, `last_seen_at`

## Component Documentation

Each component has its own `CLAUDE.md` with component-specific instructions:

- [ingest/CLAUDE.md](ingest/CLAUDE.md) — Scraper tech stack, commands, pipeline phases
- [website/CLAUDE.md](website/CLAUDE.md) — Website best practices and conventions

## Additional Documentation

- [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) — Pipeline architecture, retry/checkpoint patterns, anti-bot strategies, data extraction conventions
