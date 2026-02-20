import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

const LATITUDE = 49.328;
const LONGITUDE = -123.16;
const TIMEZONE = "America/Vancouver";
const LOCATION = "West Vancouver, BC";

type OpenMeteoDaily = {
  time: string[];
  temperature_2m_max: Array<number | null>;
  temperature_2m_min: Array<number | null>;
  temperature_2m_mean: Array<number | null>;
  precipitation_sum: Array<number | null>;
};

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

function todayInUtc() {
  const now = new Date();
  return toDateString(now);
}

function hddFromAvg(tempAvg: number | null) {
  if (tempAvg === null) return null;
  return Math.max(18 - tempAvg, 0);
}

function cddFromAvg(tempAvg: number | null) {
  if (tempAvg === null) return null;
  return Math.max(tempAvg - 18, 0);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = parseDateInput(params.get("start"));
  const end = parseDateInput(params.get("end")) ?? todayInUtc();

  const startDate = start ?? end;
  if (startDate > end) {
    return NextResponse.json({ error: "start must be <= end" }, { status: 400 });
  }

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(LATITUDE));
  url.searchParams.set("longitude", String(LONGITUDE));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", end);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum");
  url.searchParams.set("timezone", TIMEZONE);

  const weatherResponse = await fetch(url.toString(), { cache: "no-store" });
  if (!weatherResponse.ok) {
    const details = await weatherResponse.text();
    return NextResponse.json({ error: "Weather fetch failed.", details }, { status: 502 });
  }

  const weatherJson = (await weatherResponse.json()) as { daily?: OpenMeteoDaily };
  const daily = weatherJson.daily;
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    return NextResponse.json({ error: "No weather data returned for range." }, { status: 404 });
  }

  let upserted = 0;
  for (let i = 0; i < daily.time.length; i += 1) {
    const weatherDate = daily.time[i];
    const tempMin = daily.temperature_2m_min?.[i] ?? null;
    const tempMax = daily.temperature_2m_max?.[i] ?? null;
    const tempAvg = daily.temperature_2m_mean?.[i] ?? null;
    const precipitation = daily.precipitation_sum?.[i] ?? null;

    await dbQuery(
      `insert into weather_daily (
        weather_date,
        location,
        temp_min_c,
        temp_max_c,
        temp_avg_c,
        precipitation_mm,
        humidity_avg,
        hdd,
        cdd,
        source
      )
      values ($1, $2, $3, $4, $5, $6, null, $7, $8, 'open-meteo')
      on conflict (weather_date) do update set
        location = excluded.location,
        temp_min_c = excluded.temp_min_c,
        temp_max_c = excluded.temp_max_c,
        temp_avg_c = excluded.temp_avg_c,
        precipitation_mm = excluded.precipitation_mm,
        hdd = excluded.hdd,
        cdd = excluded.cdd,
        source = excluded.source`,
      [weatherDate, LOCATION, tempMin, tempMax, tempAvg, precipitation, hddFromAvg(tempAvg), cddFromAvg(tempAvg)]
    );
    upserted += 1;
  }

  await dbQuery("refresh materialized view energy_weather_report");

  return NextResponse.json({
    source: "open-meteo",
    location: LOCATION,
    start: startDate,
    end,
    upserted,
    refreshed: "energy_weather_report"
  });
}

