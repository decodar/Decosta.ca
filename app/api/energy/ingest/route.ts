import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAllowedUtilitiesForUnitName, isUtilityAllowedForUnit } from "@/lib/unit-utility-policy";
import { lookupMeterIdentifier, normalizeMeterIdentifier } from "@/lib/meter-identifier-map";

const ALLOWED_UTILITY_TYPES = new Set(["electricity", "gas", "water"]);
const ALLOWED_ENTRY_TYPES = new Set(["meter_read", "billed_usage"]);

type IngestMeterPayload = {
  mode: "meter";
  unitId: string;
  utilityType: "electricity" | "gas" | "water";
  readingValue: number;
  readingUnit: string;
  capturedAt: string;
  entryType?: "meter_read" | "billed_usage";
  periodStart?: string | null;
  periodEnd?: string | null;
  billId?: string | null;
  isOpening?: boolean | null;
};

type ExtractedEntry = {
  entry_type: "meter_read" | "billed_usage";
  utility_type: "electricity" | "gas" | "water";
  captured_at: string;
  reading_value: number;
  reading_unit: string;
  period_start: string | null;
  period_end: string | null;
  is_opening: boolean | null;
  bill_id: string | null;
  confidence: number;
  evidence: string;
};

type ExtractedMeterImage = {
  meter_identifier: string;
  reading_value: number;
  reading_unit: string | null;
  captured_at: string | null;
  confidence: number;
  evidence: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOutputText(payload: unknown) {
  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; output_text?: string }> }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  if (!Array.isArray(data.output)) {
    return "";
  }
  return data.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => part.text || part.output_text || "")
    .join("\n");
}

async function extractEntriesFromPdf(file: File, timezone: string, utilityOverride?: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  const filename = file.name || "bill.pdf";
  const prompt = [
    "Extract utility entries from this bill PDF and return STRICT JSON only.",
    "Schema:",
    '{"entries":[{"entry_type":"meter_read|billed_usage","utility_type":"electricity|gas|water","captured_at":"ISO8601","reading_value":number,"reading_unit":"kWh|m3|GJ|...","period_start":"YYYY-MM-DD|null","period_end":"YYYY-MM-DD|null","is_opening":true|false|null,"bill_id":"string|null","confidence":number,"evidence":"short source text"}]}',
    `Timezone for dates/times: ${timezone}.`,
    utilityOverride ? `Force utility_type to ${utilityOverride} when ambiguous.` : "",
    "Include both opening/closing meter reads and billed period usage totals when present."
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      text: {
        format: {
          type: "json_schema",
          name: "utility_bill_entries",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              entries: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    entry_type: { type: "string" },
                    utility_type: { type: "string" },
                    captured_at: { type: "string" },
                    reading_value: { type: "number" },
                    reading_unit: { type: "string" },
                    period_start: { type: ["string", "null"] },
                    period_end: { type: ["string", "null"] },
                    is_opening: { type: ["boolean", "null"] },
                    bill_id: { type: ["string", "null"] },
                    confidence: { type: "number" },
                    evidence: { type: "string" }
                  },
                  required: [
                    "entry_type",
                    "utility_type",
                    "captured_at",
                    "reading_value",
                    "reading_unit",
                    "period_start",
                    "period_end",
                    "is_opening",
                    "bill_id",
                    "confidence",
                    "evidence"
                  ]
                }
              }
            },
            required: ["entries"]
          }
        }
      },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_file",
              filename,
              file_data: `data:application/pdf;base64,${bytes}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI extraction failed: ${await response.text()}`);
  }

  const payload = await response.json();
  const text = getOutputText(payload);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Could not parse JSON extraction response.");
  }

  const parsed = JSON.parse(text.slice(start, end + 1)) as { entries?: ExtractedEntry[] };
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Invalid extraction payload.");
  }

  return parsed.entries
    .map((entry) => ({
      ...entry,
      utility_type: (utilityOverride || entry.utility_type) as ExtractedEntry["utility_type"]
    }))
    .filter(
      (entry) =>
        ALLOWED_UTILITY_TYPES.has(entry.utility_type) &&
        ALLOWED_ENTRY_TYPES.has(entry.entry_type) &&
        Number.isFinite(entry.reading_value)
    );
}

async function extractMeterFromImage(file: File, timezone: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const mimeType = file.type || "image/jpeg";
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  const filename = file.name || "meter.jpg";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      text: {
        format: {
          type: "json_schema",
          name: "meter_image_reading",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              meter_identifier: { type: "string" },
              reading_value: { type: "number" },
              reading_unit: { type: ["string", "null"] },
              captured_at: { type: ["string", "null"] },
              confidence: { type: "number" },
              evidence: { type: "string" }
            },
            required: ["meter_identifier", "reading_value", "reading_unit", "captured_at", "confidence", "evidence"]
          }
        }
      },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Read this utility meter photo and return STRICT JSON only.\n` +
                `Extract the meter identifier and the cumulative reading value shown.\n` +
                `If the image shows kWh, return reading_unit='kWh'. If unclear, return null.\n` +
                `If no timestamp/date is visible, return captured_at=null.\n` +
                `Use timezone ${timezone} if a date/time is visible.\n`
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${bytes}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI meter image extraction failed: ${await response.text()}`);
  }

  const payload = await response.json();
  const text = getOutputText(payload);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Could not parse meter image extraction response.");
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as ExtractedMeterImage;
  if (!parsed.meter_identifier || !Number.isFinite(parsed.reading_value)) {
    throw new Error("Meter image extraction missing identifier or reading.");
  }
  return parsed;
}

async function insertEntry(unitId: string, entry: ExtractedEntry, imageRef: string) {
  return dbQuery<{
    id: string;
    utility_type: string;
    entry_type: string;
    captured_at: string;
    reading_value: string;
    reading_unit: string;
  }>(
    `insert into meter_reading (
      unit_id, image_url, reading_value, reading_unit, captured_at,
      parsed_at, parser_confidence, parse_status, utility_type, entry_type,
      period_start, period_end, bill_id, is_opening, source, weather_day
    ) values (
      $1, $2, $3, $4, $5::timestamptz,
      now(), $6, 'approved', $7, $8, $9, $10, $11, $12, 'manual',
      ($5::timestamptz at time zone 'America/Vancouver')::date
    )
    returning id, utility_type, entry_type, captured_at, reading_value, reading_unit`,
    [
      unitId,
      imageRef,
      entry.reading_value,
      entry.reading_unit,
      entry.captured_at,
      Number.isFinite(entry.confidence) ? entry.confidence : 1,
      entry.utility_type,
      entry.entry_type,
      entry.period_start,
      entry.period_end,
      entry.bill_id,
      entry.is_opening
    ]
  );
}

async function getUsageStats(unitId: string, utilityType: string) {
  const meterReads = await dbQuery<{
    captured_at: string;
    reading_value: string;
    reading_unit: string;
  }>(
    `select captured_at::text, reading_value::text, reading_unit
     from meter_reading
     where unit_id = $1
       and utility_type = $2
       and coalesce(entry_type, 'meter_read') = 'meter_read'
       and parse_status = 'approved'
     order by captured_at desc
     limit 2`,
    [unitId, utilityType]
  );

  const usage30 = await dbQuery<{ usage_30d: string | null; usage_unit: string | null }>(
    `select
      coalesce(sum(consumption_delta), 0)::text as usage_30d,
      max(usage_unit) as usage_unit
     from energy_weather_report
     where unit_id = $1
       and utility_type = $2
       and day >= current_date - 30`,
    [unitId, utilityType]
  );

  const lastBillEnd = await dbQuery<{ last_period_end: string | null }>(
    `select max(period_end)::text as last_period_end
     from meter_reading
     where unit_id = $1
       and utility_type = $2
       and coalesce(entry_type, 'meter_read') = 'billed_usage'
       and parse_status = 'approved'`,
    [unitId, utilityType]
  );

  let sinceLastBilling: { usage: number; unit: string; fromDate: string } | null = null;
  const billEnd = lastBillEnd.rows[0]?.last_period_end;
  if (billEnd && meterReads.rows.length > 0) {
    const baseline = await dbQuery<{ reading_value: string; reading_unit: string }>(
      `select reading_value::text, reading_unit
       from meter_reading
       where unit_id = $1
         and utility_type = $2
         and coalesce(entry_type, 'meter_read') = 'meter_read'
         and parse_status = 'approved'
         and captured_at <= ($3::date + interval '1 day')
       order by captured_at desc
       limit 1`,
      [unitId, utilityType, billEnd]
    );
    if (baseline.rows.length > 0) {
      const latest = meterReads.rows[0];
      const delta = Number(latest.reading_value) - Number(baseline.rows[0].reading_value);
      sinceLastBilling = {
        usage: Number.isFinite(delta) ? delta : 0,
        unit: latest.reading_unit,
        fromDate: billEnd
      };
    }
  }

  let latestDelta: { usage: number; days: number; avgPerDay: number; unit: string } | null = null;
  if (meterReads.rows.length >= 2) {
    const latest = meterReads.rows[0];
    const prev = meterReads.rows[1];
    const usage = Number(latest.reading_value) - Number(prev.reading_value);
    const ms = new Date(latest.captured_at).getTime() - new Date(prev.captured_at).getTime();
    const days = Math.max(ms / (1000 * 60 * 60 * 24), 1 / 24);
    latestDelta = {
      usage,
      days: Number(days.toFixed(3)),
      avgPerDay: Number((usage / days).toFixed(3)),
      unit: latest.reading_unit
    };
  }

  return {
    latestDelta,
    usage30d: Number(usage30.rows[0]?.usage_30d ?? 0),
    usage30dUnit: usage30.rows[0]?.usage_unit ?? null,
    sinceLastBilling
  };
}

async function getUnitNameById(unitId: string) {
  const result = await dbQuery<{ unit_name: string }>(
    `select unit_name
     from rental_unit
     where id = $1::uuid
     limit 1`,
    [unitId]
  );
  return result.rows[0]?.unit_name ?? null;
}

async function getUnitIdByName(unitName: string) {
  const result = await dbQuery<{ id: string }>(
    `select id::text as id
     from rental_unit
     where lower(unit_name) = lower($1)
     limit 1`,
    [unitName]
  );
  return result.rows[0]?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const mode = String(form.get("mode") || "bill");
      if (mode !== "bill" && mode !== "meter_image") {
        return NextResponse.json({ error: "Unsupported multipart mode." }, { status: 400 });
      }

      const timezone = String(form.get("timezone") || "America/Vancouver");
      const file = form.get("file");
      const utilityOverride = String(form.get("utilityType") || "").trim() || null;
      let unitId = String(form.get("unitId") || "");

      if (utilityOverride && !ALLOWED_UTILITY_TYPES.has(utilityOverride)) {
        return NextResponse.json({ error: "Invalid utilityType." }, { status: 400 });
      }
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Upload file is required." }, { status: 400 });
      }
      if (mode === "meter_image") {
        const extracted = await extractMeterFromImage(file, timezone);
        const mapping = lookupMeterIdentifier(extracted.meter_identifier);
        if (!mapping) {
          return NextResponse.json(
            {
              error: `Unknown meter identifier '${normalizeMeterIdentifier(extracted.meter_identifier)}'. Add a mapping before ingest.`,
              extracted
            },
            { status: 422 }
          );
        }
        const mappedUnitId = await getUnitIdByName(mapping.unitName);
        if (!mappedUnitId) {
          return NextResponse.json({ error: `Mapped unit '${mapping.unitName}' not found in rental_unit.` }, { status: 404 });
        }
        if (unitId && (!isUuid(unitId) || unitId !== mappedUnitId)) {
          return NextResponse.json(
            {
              error: `Meter identifier maps to '${mapping.unitName}', but selected unit does not match.`,
              mappedUnitName: mapping.unitName
            },
            { status: 400 }
          );
        }
        unitId = mappedUnitId;
        const entry: ExtractedEntry = {
          entry_type: "meter_read",
          utility_type: mapping.utilityType,
          captured_at: extracted.captured_at || new Date().toISOString(),
          reading_value: Number(extracted.reading_value),
          reading_unit: extracted.reading_unit || mapping.readingUnitDefault,
          period_start: null,
          period_end: null,
          bill_id: `meter-image-${normalizeMeterIdentifier(extracted.meter_identifier)}`,
          is_opening: null,
          confidence: extracted.confidence,
          evidence: extracted.evidence
        };
        const inserted = await insertEntry(unitId, entry, `meter-image:${file.name}`);
        await dbQuery("refresh materialized view energy_weather_report");
        const stats = await getUsageStats(unitId, mapping.utilityType);
        return NextResponse.json({
          mode: "meter",
          meterIdentifier: extracted.meter_identifier,
          mappedMeter: mapping,
          insertedCount: 1,
          inserted: inserted.rows,
          statsByUtility: { [mapping.utilityType]: stats }
        });
      }

      if (!unitId || !isUuid(unitId)) {
        return NextResponse.json({ error: "Valid unitId is required." }, { status: 400 });
      }
      const unitName = await getUnitNameById(unitId);
      if (!unitName) {
        return NextResponse.json({ error: "Unit not found." }, { status: 404 });
      }
      if (utilityOverride && !isUtilityAllowedForUnit(unitName, utilityOverride)) {
        return NextResponse.json(
          {
            error: `Utility '${utilityOverride}' is not allowed for unit '${unitName}'.`,
            allowedUtilities: getAllowedUtilitiesForUnitName(unitName)
          },
          { status: 400 }
        );
      }

      const extracted = await extractEntriesFromPdf(file, timezone, utilityOverride);
      if (extracted.length === 0) {
        return NextResponse.json({ error: "No valid entries extracted from bill." }, { status: 422 });
      }
      const invalid = extracted.find((entry) => !isUtilityAllowedForUnit(unitName, entry.utility_type));
      if (invalid) {
        return NextResponse.json(
          {
            error: `Extracted utility '${invalid.utility_type}' is not allowed for unit '${unitName}'.`,
            allowedUtilities: getAllowedUtilitiesForUnitName(unitName)
          },
          { status: 400 }
        );
      }

      const inserted = [];
      for (let i = 0; i < extracted.length; i += 1) {
        const row = extracted[i];
        const result = await insertEntry(unitId, row, `upload:${file.name}#${i + 1}`);
        inserted.push(result.rows[0]);
      }

      await dbQuery("refresh materialized view energy_weather_report");
      const statsByUtility: Record<string, Awaited<ReturnType<typeof getUsageStats>>> = {};
      for (const utilityType of Array.from(new Set(inserted.map((r) => r.utility_type)))) {
        statsByUtility[utilityType] = await getUsageStats(unitId, utilityType);
      }

      return NextResponse.json({
        mode: "bill",
        insertedCount: inserted.length,
        inserted,
        statsByUtility
      });
    }

    const body = (await request.json()) as Partial<IngestMeterPayload>;
    if (body.mode !== "meter") {
      return NextResponse.json({ error: "Invalid mode. Use mode='meter' for JSON requests." }, { status: 400 });
    }
    if (!body.unitId || !isUuid(body.unitId)) {
      return NextResponse.json({ error: "Valid unitId is required." }, { status: 400 });
    }
    if (!body.utilityType || !ALLOWED_UTILITY_TYPES.has(body.utilityType)) {
      return NextResponse.json({ error: "Invalid utilityType." }, { status: 400 });
    }
    const unitName = await getUnitNameById(body.unitId);
    if (!unitName) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }
    if (!isUtilityAllowedForUnit(unitName, body.utilityType)) {
      return NextResponse.json(
        {
          error: `Utility '${body.utilityType}' is not allowed for unit '${unitName}'.`,
          allowedUtilities: getAllowedUtilitiesForUnitName(unitName)
        },
        { status: 400 }
      );
    }

    const entryType = body.entryType ?? "meter_read";
    if (!ALLOWED_ENTRY_TYPES.has(entryType)) {
      return NextResponse.json({ error: "Invalid entryType." }, { status: 400 });
    }
    if (entryType === "billed_usage" && (!body.periodStart || !body.periodEnd)) {
      return NextResponse.json({ error: "periodStart and periodEnd are required for billed_usage." }, { status: 400 });
    }
    if (!body.capturedAt || Number.isNaN(new Date(body.capturedAt).getTime())) {
      return NextResponse.json({ error: "Valid capturedAt is required." }, { status: 400 });
    }
    if (!Number.isFinite(body.readingValue)) {
      return NextResponse.json({ error: "readingValue is required." }, { status: 400 });
    }

    const entry: ExtractedEntry = {
      entry_type: entryType,
      utility_type: body.utilityType,
      captured_at: body.capturedAt,
      reading_value: Number(body.readingValue),
      reading_unit: body.readingUnit || (body.utilityType === "gas" ? "m3" : "kWh"),
      period_start: body.periodStart ?? null,
      period_end: body.periodEnd ?? null,
      bill_id: body.billId ?? null,
      is_opening: body.isOpening ?? null,
      confidence: 1,
      evidence: "manual-entry"
    };

    const inserted = await insertEntry(body.unitId, entry, "manual-entry");
    await dbQuery("refresh materialized view energy_weather_report");
    const stats = await getUsageStats(body.unitId, body.utilityType);

    return NextResponse.json({
      mode: "meter",
      insertedCount: 1,
      inserted: inserted.rows,
      statsByUtility: { [body.utilityType]: stats }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Ingest failed.", details: message }, { status: 500 });
  }
}
