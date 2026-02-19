# Business Listings Platform

Monorepo with two components that share a Supabase `listings` table:

- **`ingest/`** — Daily scraper that collects business-for-sale listings from BizBuySell
- **`website/`** — Next.js frontend that displays listings to users

**IMPORTANT: When working on a new feature or bug fix, always create a git branch first. Work on changes in that branch for the remainder of the session.**

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
