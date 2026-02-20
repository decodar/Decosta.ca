# decosta.ca

Portfolio + AI retrieval assistant + rental operations tools.

## Stack
- Next.js (App Router, TypeScript)
- Postgres + pgvector (for content retrieval)
- Vercel deployment

## Routes
- `/` Home
- `/about`
- `/projects`
- `/projects/[slug]`
- `/travel-recommendations`
- `/blog`
- `/blog/[slug]`
- `/tools/energy`
- `/tools/energy/reports`
- `/chat`
- `/contact`
- `/admin`
- `/api/chat`
- `/api/energy/reports`
- `/api/meter-parse`
- `/api/weather/sync`

## Local setup
1. Install dependencies: `npm install`
2. Add environment variables:
   - `OPENAI_API_KEY=...`
   - `DATABASE_URL=...`
3. Run: `npm run dev`

## Database setup
Run migrations in order:
1. `db/migrations/001_init.sql`
2. `db/migrations/002_energy_weather_report.sql`

## Notes
- `/api/chat` can retrieve context from `kb_chunk`/`kb_document` when no `contextChunks` are provided by the client.
- `/api/meter-parse` now persists readings to `meter_reading` with `pending_review` status.
- `/api/energy/reports` reads materialized report data from `energy_weather_report`.
- `/api/weather/sync` fetches Open-Meteo daily weather and upserts `weather_daily`, then refreshes `energy_weather_report`.

## Weather Sync Usage
- Sync one day:
  - `GET /api/weather/sync?start=2026-02-20&end=2026-02-20`
- Sync a range:
  - `GET /api/weather/sync?start=2026-01-01&end=2026-02-20`
