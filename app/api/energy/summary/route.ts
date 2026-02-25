import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type SummaryRow = {
  utilityType: "electricity" | "gas";
  dailyConsumption: number | null;
  dailyUnit: string | null;
  lastMonthBilledAmount: number | null;
  lastMonthBilledAmountCurrency: "CAD";
  currentMeterRead: number | null;
  currentMeterReadUnit: string | null;
  currentMeterReadAt: string | null;
  lastMonthEndMeterRead: number | null;
  lastMonthEndMeterReadUnit: string | null;
  lastMonthEndMeterReadAt: string | null;
};

async function buildUtilitySummary(unitId: string, utilityType: "electricity" | "gas"): Promise<SummaryRow> {
  const latestTwoReads = await dbQuery<{
    captured_at: string;
    reading_value: string;
    reading_unit: string;
  }>(
    `select captured_at::text, reading_value::text, reading_unit
     from meter_reading
     where unit_id = $1::uuid
       and utility_type = $2
       and coalesce(entry_type, 'meter_read') = 'meter_read'
       and parse_status = 'approved'
     order by captured_at desc
     limit 2`,
    [unitId, utilityType]
  );

  const monthBoundaries = await dbQuery<{
    last_month_end: string;
    last_month_start: string;
  }>(
    `select
      (date_trunc('month', now())::date - 1)::text as last_month_end,
      (date_trunc('month', now())::date - interval '1 month')::date::text as last_month_start`
  );
  const lastMonthEnd = monthBoundaries.rows[0]?.last_month_end;
  const lastMonthStart = monthBoundaries.rows[0]?.last_month_start;

  const lastMonthEndRead = await dbQuery<{
    captured_at: string;
    reading_value: string;
    reading_unit: string;
  }>(
    `select captured_at::text, reading_value::text, reading_unit
     from meter_reading
     where unit_id = $1::uuid
       and utility_type = $2
       and coalesce(entry_type, 'meter_read') = 'meter_read'
       and parse_status = 'approved'
       and captured_at <= ($3::date + interval '1 day')
     order by captured_at desc
     limit 1`,
    [unitId, utilityType, lastMonthEnd]
  );

  let dailyConsumption: number | null = null;
  let dailyUnit: string | null = null;
  if (latestTwoReads.rows.length >= 2) {
    const latest = latestTwoReads.rows[0];
    const prev = latestTwoReads.rows[1];
    const usage = Number(latest.reading_value) - Number(prev.reading_value);
    const days = Math.max(
      (new Date(latest.captured_at).getTime() - new Date(prev.captured_at).getTime()) / (1000 * 60 * 60 * 24),
      1 / 24
    );
    dailyConsumption = Number((usage / days).toFixed(3));
    dailyUnit = latest.reading_unit;
  }

  const current = latestTwoReads.rows[0];
  const monthEndRead = lastMonthEndRead.rows[0];

  const lastMonthCharge = await dbQuery<{ total_charges_cad: string }>(
    `select total_charges_cad::text
     from utility_bill_charge
     where unit_id = $1::uuid
       and utility_type = $2
       and (
         (period_end is not null and period_end between $3::date and $4::date)
         or (period_end is null and period_start is not null and period_start between $3::date and $4::date)
       )
     order by coalesce(period_end, period_start) desc, created_at desc
     limit 1`,
    [unitId, utilityType, lastMonthStart, lastMonthEnd]
  );

  return {
    utilityType,
    dailyConsumption,
    dailyUnit,
    lastMonthBilledAmount: lastMonthCharge.rows[0] ? Number(lastMonthCharge.rows[0].total_charges_cad) : null,
    lastMonthBilledAmountCurrency: "CAD",
    currentMeterRead: current ? Number(current.reading_value) : null,
    currentMeterReadUnit: current?.reading_unit ?? null,
    currentMeterReadAt: current?.captured_at ?? null,
    lastMonthEndMeterRead: monthEndRead ? Number(monthEndRead.reading_value) : null,
    lastMonthEndMeterReadUnit: monthEndRead?.reading_unit ?? null,
    lastMonthEndMeterReadAt: monthEndRead?.captured_at ?? null
  };
}

export async function GET(request: NextRequest) {
  const unitId = request.nextUrl.searchParams.get("unitId");
  if (!unitId || !isUuid(unitId)) {
    return NextResponse.json({ error: "Valid unitId is required." }, { status: 400 });
  }

  const unit = await dbQuery<{ id: string; unit_name: string }>(
    `select id::text as id, unit_name
     from rental_unit
     where id = $1::uuid
     limit 1`,
    [unitId]
  );
  if (unit.rows.length === 0) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const rows = await Promise.all([
    buildUtilitySummary(unitId, "electricity"),
    buildUtilitySummary(unitId, "gas")
  ]);

  return NextResponse.json({
    unit: unit.rows[0],
    rows
  });
}
