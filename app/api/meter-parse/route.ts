import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAllowedUtilitiesForUnitName, isUtilityAllowedForUnit } from "@/lib/unit-utility-policy";

type MeterParsePayload = {
  unitId: string;
  imageUrl?: string;
  imageBase64?: string;
  capturedAt?: string;
  readingValue?: number;
  readingUnit?: string;
  parserConfidence?: number;
  utilityType?: "electricity" | "gas" | "water";
  entryType?: "meter_read" | "billed_usage";
  periodStart?: string;
  periodEnd?: string;
  billId?: string;
  isOpening?: boolean;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<MeterParsePayload>;
  const entryType = body.entryType ?? "meter_read";

  if (!body.unitId) {
    return NextResponse.json({ error: "unitId is required." }, { status: 400 });
  }
  if (entryType === "meter_read" && !body.imageUrl && !body.imageBase64) {
    return NextResponse.json({ error: "image payload is required for meter_read entries." }, { status: 400 });
  }

  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    return NextResponse.json({ error: "Invalid capturedAt timestamp." }, { status: 400 });
  }

  const readingValue = Number.isFinite(body.readingValue) ? Number(body.readingValue) : 0;
  const readingUnit = body.readingUnit?.trim() || "kWh";
  const parserConfidence = Number.isFinite(body.parserConfidence) ? Number(body.parserConfidence) : 0;
  const parseStatus = "pending_review";
  const utilityType = body.utilityType ?? "electricity";
  const periodStart = body.periodStart ?? null;
  const periodEnd = body.periodEnd ?? null;
  const imageUrl = body.imageUrl?.trim() || "inline-upload";
  const weatherDay = capturedAt.toISOString().slice(0, 10);
  const billId = body.billId?.trim() || null;
  const isOpening = typeof body.isOpening === "boolean" ? body.isOpening : null;

  if (!["electricity", "gas", "water"].includes(utilityType)) {
    return NextResponse.json({ error: "Invalid utilityType." }, { status: 400 });
  }
  const unitRow = await dbQuery<{ unit_name: string }>(
    `select unit_name
     from rental_unit
     where id = $1::uuid
     limit 1`,
    [body.unitId]
  );
  const unitName = unitRow.rows[0]?.unit_name;
  if (!unitName) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }
  if (!isUtilityAllowedForUnit(unitName, utilityType)) {
    return NextResponse.json(
      {
        error: `Utility '${utilityType}' is not allowed for unit '${unitName}'.`,
        allowedUtilities: getAllowedUtilitiesForUnitName(unitName)
      },
      { status: 400 }
    );
  }
  if (!["meter_read", "billed_usage"].includes(entryType)) {
    return NextResponse.json({ error: "Invalid entryType." }, { status: 400 });
  }
  if (entryType === "billed_usage" && (!periodStart || !periodEnd)) {
    return NextResponse.json({ error: "periodStart and periodEnd are required for billed_usage." }, { status: 400 });
  }

  try {
    const result = await dbQuery<{
      id: string;
      unit_id: string;
      utility_type: string;
      entry_type: string;
      period_start: string | null;
      period_end: string | null;
      bill_id: string | null;
      is_opening: boolean | null;
      reading_value: string;
      reading_unit: string;
      parse_status: string;
      captured_at: string;
      parser_confidence: string | null;
      created_at: string;
    }>(
      `insert into meter_reading (
        unit_id,
        image_url,
        reading_value,
        reading_unit,
        captured_at,
        parser_confidence,
        parse_status,
        utility_type,
        entry_type,
        period_start,
        period_end,
        bill_id,
        is_opening,
        source,
        weather_day
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'upload', $14)
      returning id, unit_id, utility_type, entry_type, period_start, period_end, bill_id, is_opening, reading_value, reading_unit, parse_status, captured_at, parser_confidence, created_at`,
      [
        body.unitId,
        imageUrl,
        readingValue,
        readingUnit,
        capturedAt.toISOString(),
        parserConfidence,
        parseStatus,
        utilityType,
        entryType,
        periodStart,
        periodEnd,
        billId,
        isOpening,
        weatherDay
      ]
    );

    return NextResponse.json({
      ...result.rows[0],
      note: "Reading persisted with pending_review status."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    return NextResponse.json({ error: "Failed to save meter reading.", details: message }, { status: 500 });
  }
}
