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

**Scoring & ranking (implemented):**
- Each listing gets an **index score** (0–100) based on weighted signals
- Signal weights are defined in `ingest/lib/weights.mjs` (configurable, not hardcoded)
- Signals extracted from description text and structured fields:
  - SDE multiple (price relative to earnings) — weight 20
  - Owner involvement level (absentee → owner-operated) — weight 15
  - Recurring revenue (contracts, subscriptions) — weight 15
  - Growth potential indicators — weight 10
  - Data completeness (penalize missing financials) — weight 10
  - Reason for sale (retiring, relocation vs declining) — weight 8
  - SBA pre-qualification — weight 7
  - Lease terms (favorable → unfavorable) — weight 5
  - Customer concentration risk (negative signal) — weight 5
  - Employee dependency (negative signal) — weight 5
- To rescore all listings after changing weights: `cd ingest && npm run score`
- The scoring model is evolving — new signals can be added without schema changes

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

**Table: `listings`** — upsert conflict key: `(source, source_listing_id)`

Key columns: `source`, `source_listing_id`, `url`, `state`, `industry`,
`asking_price`, `cash_flow_sde`, `gross_revenue`, `ebitda`, `inventory`, `ffe`,
`num_employees`, `num_years`, `description_text`, `owner_involvement`,
`has_recurring_revenue`, `content_hash`, `is_active`, `last_seen_at`, `index_score`

**Table: `listing_scores`** — one row per listing, unique on `listing_id`

Stores the scoring breakdown separately from raw listing data (hybrid design).
Columns: `listing_id` (FK → listings.id), `index_score`, `signals` (JSONB), `scored_at`

The `signals` JSONB contains each signal's extracted value and normalized score:
```json
{ "sde_multiple": { "value": 2.5, "score": 0.8 }, "owner_involvement": { "value": "semi-absentee", "score": 0.8 }, ... }
```

`index_score` is denormalized on both tables — `listings.index_score` for fast sorting, `listing_scores.index_score` for the full scoring record.

## Component Documentation

Each component has its own `CLAUDE.md` with component-specific instructions:

- [ingest/CLAUDE.md](ingest/CLAUDE.md) — Scraper tech stack, commands, pipeline phases
- [website/CLAUDE.md](website/CLAUDE.md) — Website best practices and conventions

## Additional Documentation

- [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) — Pipeline architecture, retry/checkpoint patterns, anti-bot strategies, data extraction conventions
