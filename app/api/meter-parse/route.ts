import { NextRequest, NextResponse } from "next/server";

type MeterParsePayload = {
  unitId: string;
  imageUrl?: string;
  imageBase64?: string;
  capturedAt?: string;
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

  // Placeholder parser response. Replace with OpenAI vision extraction and manual review workflow.
  return NextResponse.json({
    unitId: body.unitId,
    readingValue: 0,
    readingUnit: "kWh",
    parserConfidence: 0,
    parseStatus: "pending_review",
    capturedAt: capturedAt.toISOString(),
    note: "Stub parser: integrate OCR/vision and DB persistence in next step."
  });
}
