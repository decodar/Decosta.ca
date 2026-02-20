import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const unitId = searchParams.get("unitId");
  const daysRaw = searchParams.get("days");
  const days = Math.min(Math.max(Number(daysRaw ?? "30"), 1), 366);

  if (unitId && !isUuid(unitId)) {
    return NextResponse.json({ error: "Invalid unitId." }, { status: 400 });
  }

  try {
    const report = await dbQuery<{
      unit_id: string;
      day: string;
      consumption_delta: string | null;
      temp_avg_c: string | null;
      hdd: string | null;
      cdd: string | null;
      precipitation_mm: string | null;
    }>(
      `select
        unit_id::text,
        day::text,
        consumption_delta::text,
        temp_avg_c::text,
        hdd::text,
        cdd::text,
        precipitation_mm::text
      from energy_weather_report
      where day >= current_date - $1::int
        and ($2::uuid is null or unit_id = $2::uuid)
      order by day desc`,
      [days, unitId]
    );

    const units = await dbQuery<{ id: string; unit_name: string; meter_type: string }>(
      `select id::text, unit_name, meter_type
       from rental_unit
       order by unit_name asc`
    );

    return NextResponse.json({
      filters: { unitId, days },
      units: units.rows,
      rows: report.rows
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    return NextResponse.json({ error: "Failed to fetch report data.", details: message }, { status: 500 });
  }
}

