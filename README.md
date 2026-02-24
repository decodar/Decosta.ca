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
- `/api/energy/ingest`
- `/api/energy/reports`
- `/api/energy/summary`
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
2. `db/migrations/003_meter_reading_gas_and_periods.sql`
3. `db/migrations/004_meter_reading_bill_metadata.sql`
4. `db/migrations/002_energy_weather_report.sql`

## Notes
- `/api/chat` can retrieve context from `kb_chunk`/`kb_document` when no `contextChunks` are provided by the client.
- `/api/meter-parse` now persists readings to `meter_reading` with `pending_review` status.
- `/api/energy/reports` reads materialized report data from `energy_weather_report`.
- `/api/weather/sync` fetches Open-Meteo daily weather and upserts `weather_daily`, then refreshes `energy_weather_report`.

## Bill Backfill (PDF)
- Script: `scripts/import-bills.mjs`
- Dry-run extraction:
  - `npm run import:bills -- --unit "House" imports/bills/house-dec-2025.pdf imports/bills/house-jan-2026.pdf`
- Apply inserts to DB:
  - `npm run import:bills -- --unit "House" --apply imports/bills/house-dec-2025.pdf imports/bills/house-jan-2026.pdf`
- Auto gas import from bill (meter reads + billed GJ in one run):
  - `npm run import:bills -- --unit "House" --apply imports/bills/house-gas-jan-2026.pdf`
- Gas billed usage (period allocation):
  - `npm run import:bills -- --unit "House" --utility-type gas --entry-type billed_usage --period-start 2026-01-01 --period-end 2026-01-31 --apply imports/bills/house-jan-2026.pdf`
- Required env vars:
  - `OPENAI_API_KEY`
  - `DATABASE_URL`

## Weather Sync Usage
- Sync one day:
  - `GET /api/weather/sync?start=2026-02-20&end=2026-02-20`
- Sync a range:
  - `GET /api/weather/sync?start=2026-01-01&end=2026-02-20`

## Energy Report Filters
- `GET /api/energy/reports?days=60`
- `GET /api/energy/reports?unitId=<uuid>&utilityType=electricity&days=90`
- `GET /api/energy/reports?unitId=<uuid>&utilityType=gas&days=180`

## Energy Ingest
- Manual meter/billed entry:
  - `POST /api/energy/ingest` (JSON, `mode="meter"`)
- Bill PDF ingest:
  - `POST /api/energy/ingest` (multipart form-data with `mode="bill"` and `file`)
- Unit utility policy enforced in UI/API:
  - `Coach`: electricity only
  - `Suite`: electricity only
  - `House`: electricity + gas
- Response includes inserted rows and quick stats:
  - latest interval delta
  - 30-day usage total
  - usage since last billed period
- UI also fetches `/api/energy/summary` after successful submissions to show:
  - daily consumption (electricity/gas)
  - current meter read
  - last month-end meter read
  - last month billed amount (placeholder until bill totals are stored)

## Billed Usage API Example
- `POST /api/meter-parse` for natural gas bill totals (no image required):
```json
{
  "unitId": "025877fd-70fe-420b-a153-9c91949767ba",
  "utilityType": "gas",
  "entryType": "billed_usage",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-01-31",
  "capturedAt": "2026-02-01T00:00:00-08:00",
  "readingValue": 95.4,
  "readingUnit": "m3",
  "parserConfidence": 1
}
```
