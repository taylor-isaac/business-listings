# Business Listings Website

Frontend that displays business-for-sale listings from the shared Supabase
`listings` table. See the root CLAUDE.md for the database schema.

## Tech Stack

- **Framework**: Next.js 15 (App Router, server components)
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`

## Project Structure

```
app/
  layout.js             # Root layout with Tailwind globals
  page.js               # Main listings page (server component)
  globals.css           # Tailwind directives
lib/
  supabase.js           # Supabase client + query functions
```

## Commands

All commands run from this (`website/`) directory:

```bash
npm install             # Install dependencies
npm run dev             # Start dev server (localhost:3000)
npm run build           # Production build
npm run start           # Start production server
```

## Environment Variables

Uses the same Supabase credentials as ingest. Create `.env.local`:

```
SUPABASE_URL=<from root .env>
SUPABASE_SERVICE_ROLE_KEY=<from root .env>
```

## Skills Reference

When building or modifying the frontend, consult these global skills for best practices:

- **Frontend Design** — Creative, production-grade UI that avoids generic AI aesthetics: `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`
- **Vercel React Best Practices** — 57 performance rules for React/Next.js (waterfalls, bundle size, SSR, re-renders): `~/.agents/skills/vercel-react-best-practices/SKILL.md`

## Data Source

This website reads from the `listings` table populated by the `ingest/` scraper.
See the root [CLAUDE.md](../CLAUDE.md) for the full column schema.

Listings are sorted by `index_score` (descending, nulls last). The score is computed
by the ingest scoring system and stored on `listings.index_score`. The full signal
breakdown is available in the `listing_scores` table if needed for detail views.

### Data flow for displayed columns

Most columns come directly from `listings` table fields (asking_price, cash_flow_sde,
num_employees, owner_involvement, sba_preapproval, has_recurring_revenue, num_years, etc.).

Three columns are derived from the `listing_scores.signals` JSONB and flattened in
`lib/supabase.js` during the query:
- `sde_multiple` — from `signals.sde_multiple.value`
- `reason_for_sale` — from `signals.reason_for_sale.value`
- `price_revenue_ratio` — from `signals.price_revenue_ratio.value`

### Current table columns

Industry (link to source), Score, State, Asking Price, Revenue, Cash Flow, SDE Multiple,
Employees, Owner Involvement, Reason for Sale, SBA Pre-qualified, Price/Revenue Ratio,
Recurring Revenue, Years in Business
