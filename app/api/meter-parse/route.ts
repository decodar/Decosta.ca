import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

type MeterParsePayload = {
  unitId: string;
  imageUrl?: string;
  imageBase64?: string;
  capturedAt?: string;
  readingValue?: number;
  readingUnit?: string;
  parserConfidence?: number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<MeterParsePayload>;

  if (!body.unitId || (!body.imageUrl && !body.imageBase64)) {
    return NextResponse.json({ error: "unitId and image payload are required." }, { status: 400 });
  }

  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    return NextResponse.json({ error: "Invalid capturedAt timestamp." }, { status: 400 });
  }

  const readingValue = Number.isFinite(body.readingValue) ? Number(body.readingValue) : 0;
  const readingUnit = body.readingUnit?.trim() || "kWh";
  const parserConfidence = Number.isFinite(body.parserConfidence) ? Number(body.parserConfidence) : 0;
  const parseStatus = "pending_review";
  const imageUrl = body.imageUrl?.trim() || "inline-upload";
  const weatherDay = capturedAt.toISOString().slice(0, 10);

  try {
    const result = await dbQuery<{
      id: string;
      unit_id: string;
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
        source,
        weather_day
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'upload', $8)
      returning id, unit_id, reading_value, reading_unit, parse_status, captured_at, parser_confidence, created_at`,
      [body.unitId, imageUrl, readingValue, readingUnit, capturedAt.toISOString(), parserConfidence, parseStatus, weatherDay]
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
