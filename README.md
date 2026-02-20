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
- `/api/meter-parse`

## Local setup
1. Install dependencies: `npm install`
2. Add environment variables:
   - `OPENAI_API_KEY=...`
3. Run: `npm run dev`

## Database setup
Run migrations in order:
1. `db/migrations/001_init.sql`
2. `db/migrations/002_energy_weather_report.sql`

## Notes
- `/api/chat` is wired to OpenAI Responses API and expects retrieved context chunks.
- `/api/meter-parse` is a stub; replace with vision extraction + DB persistence.
