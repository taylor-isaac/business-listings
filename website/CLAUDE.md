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

## Data Source

This website reads from the `listings` table populated by the `ingest/` scraper.
See the root [CLAUDE.md](../CLAUDE.md) for the full column schema.

Listings are sorted by `index_score` (descending, nulls last). The score is computed
by the ingest scoring system and stored on `listings.index_score`. The full signal
breakdown is available in the `listing_scores` table if needed for detail views.
