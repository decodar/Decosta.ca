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
  meter_identifier_candidates: string[];
  reading_value: number;
  reading_unit: string | null;
  captured_at: string | null;
  confidence: number;
  evidence: string;
};

type MeterImageNormalizationResult = {
  readingValue: number;
  correctionNote: string | null;
  flagged: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function round3(value: number) {
  return Number(value.toFixed(3));
}

function getMaxReasonableDailyUsage(utilityType: string) {
  switch (utilityType) {
    case "electricity":
      return 250; // kWh/day ceiling for these units, intentionally high
    case "gas":
      return 80; // m3/day ceiling
    case "water":
      return 20;
    default:
      return 250;
  }
}

function getRollingWindowSize(utilityType: string) {
  switch (utilityType) {
    case "electricity":
      return 12;
    case "gas":
      return 18;
    case "water":
      return 12;
    default:
      return 12;
  }
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

function uniqueNormalizedMeterIdCandidates(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalizeMeterIdentifier(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractDigitSequences(text: string | null | undefined) {
  if (!text) {
    return [];
  }
  const matches = text.match(/\d[\d\s-]{4,}\d/g) || [];
  return matches.map((m) => normalizeMeterIdentifier(m)).filter(Boolean);
}

function chooseMappedMeterIdentifier(extracted: ExtractedMeterImage) {
  const candidates = uniqueNormalizedMeterIdCandidates([
    extracted.meter_identifier,
    ...(Array.isArray(extracted.meter_identifier_candidates) ? extracted.meter_identifier_candidates : []),
    ...extractDigitSequences(extracted.evidence)
  ]);

  // Prefer the known BC Hydro meter-id format first.
  const prioritized = [...candidates].sort((a, b) => {
    const aScore = Number(/^345\d{6}$/.test(a)) * 10 + Number(a.length === 9);
    const bScore = Number(/^345\d{6}$/.test(b)) * 10 + Number(b.length === 9);
    return bScore - aScore;
  });

  for (const candidate of prioritized) {
    const mapping = lookupMeterIdentifier(candidate);
    if (mapping) {
      return { identifier: candidate, mapping, tried: prioritized };
    }
  }
  return { identifier: normalizeMeterIdentifier(extracted.meter_identifier), mapping: null, tried: prioritized };
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

  let mimeType = file.type || "image/jpeg";
  let rawBuffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "meter.jpg";
  const lowerName = filename.toLowerCase();

  const isHeic =
    mimeType.includes("heic") ||
    mimeType.includes("heif") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif");

  if (isHeic) {
    try {
      const { default: heicConvert } = await import("heic-convert");
      const converted = await heicConvert({
        buffer: rawBuffer,
        format: "JPEG",
        quality: 0.9
      });
      if (Buffer.isBuffer(converted)) {
        rawBuffer = converted;
      } else if (converted instanceof Uint8Array) {
        rawBuffer = Buffer.from(converted);
      } else if (converted instanceof ArrayBuffer) {
        rawBuffer = Buffer.from(new Uint8Array(converted));
      } else {
        throw new Error("Unsupported HEIC conversion output type");
      }
      mimeType = "image/jpeg";
    } catch (error) {
      const message = error instanceof Error ? error.message : "HEIC conversion failed";
      throw new Error(`Failed to convert HEIC image: ${message}`);
    }
  }

  const bytes = rawBuffer.toString("base64");

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
              meter_identifier_candidates: {
                type: "array",
                items: { type: "string" }
              },
              reading_value: { type: "number" },
              reading_unit: { type: ["string", "null"] },
              captured_at: { type: ["string", "null"] },
              confidence: { type: "number" },
              evidence: { type: "string" }
            },
            required: [
              "meter_identifier",
              "meter_identifier_candidates",
              "reading_value",
              "reading_unit",
              "captured_at",
              "confidence",
              "evidence"
            ]
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
                `Extract the true utility meter identifier (serial/meter number) and the cumulative reading value shown.\n` +
                `Do NOT return model numbers, part numbers, form numbers, or manufacturer codes as meter_identifier.\n` +
                `The true electricity meter identifier for this site is a 9-digit number and often starts with '345'.\n` +
                `Return meter_identifier_candidates as all plausible identifier-like numbers visible on the meter face (excluding the kWh reading display).\n` +
                `If the image shows kWh, return reading_unit='kWh'. If unclear, return null.\n` +
                `If no timestamp/date is visible, return captured_at=null.\n` +
                `Use timezone ${timezone} if a date/time is visible.\n` +
                `The uploaded image may be converted from HEIC to JPEG before processing.\n`
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
  if (!Array.isArray(parsed.meter_identifier_candidates)) {
    parsed.meter_identifier_candidates = [];
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

async function getRecentMeterReads(unitId: string, utilityType: string, limit = 4) {
  return dbQuery<{
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
     limit $3`,
    [unitId, utilityType, limit]
  );
}

function buildMeterReadVariants(raw: number) {
  const variants = new Set<number>();
  if (Number.isFinite(raw)) {
    variants.add(raw);
  }
  const rounded = Math.round(raw);
  const rawStr = String(rounded);
  if (Number.isInteger(raw) && rawStr.length >= 4) {
    const strip1 = Number(rawStr.slice(0, -1));
    if (Number.isFinite(strip1)) {
      variants.add(strip1);
    }
    if (rawStr.length >= 5) {
      const strip2 = Number(rawStr.slice(0, -2));
      if (Number.isFinite(strip2)) {
        variants.add(strip2);
      }
    }
  }
  return Array.from(variants);
}

async function normalizeMeterImageReadingValue(
  unitId: string,
  utilityType: string,
  capturedAtIso: string,
  rawValue: number
): Promise<MeterImageNormalizationResult> {
  const recent = await getRecentMeterReads(unitId, utilityType, getRollingWindowSize(utilityType));
  const latest = recent.rows[0];
  if (!latest) {
    return { readingValue: rawValue, correctionNote: null, flagged: false };
  }

  const prevValue = Number(latest.reading_value);
  const prevAt = new Date(latest.captured_at).getTime();
  const nextAt = new Date(capturedAtIso).getTime();
  const elapsedDays = Math.max((nextAt - prevAt) / (1000 * 60 * 60 * 24), 1 / 24);
  const maxReasonableDelta = getMaxReasonableDailyUsage(utilityType) * Math.max(elapsedDays, 1);
  const rawDelta = rawValue - prevValue;
  const historicDailyRates: number[] = [];
  const weightedRates: Array<{ rate: number; weight: number }> = [];
  for (let i = 0; i < recent.rows.length - 1; i += 1) {
    const newer = recent.rows[i];
    const older = recent.rows[i + 1];
    const delta = Number(newer.reading_value) - Number(older.reading_value);
    const days = Math.max(
      (new Date(newer.captured_at).getTime() - new Date(older.captured_at).getTime()) / (1000 * 60 * 60 * 24),
      1 / 24
    );
    if (!Number.isFinite(delta) || delta < 0) {
      continue;
    }
    const rate = delta / days;
    historicDailyRates.push(rate);
    // Heavier weight to recent intervals; rolling behavior adapts to seasonality.
    const recencyWeight = Math.max(recent.rows.length - i, 1);
    weightedRates.push({ rate, weight: recencyWeight });
  }

  const weightedRateSum = weightedRates.reduce((sum, item) => sum + item.rate * item.weight, 0);
  const weightSum = weightedRates.reduce((sum, item) => sum + item.weight, 0);
  const rollingDailyExpected = weightSum > 0 ? weightedRateSum / weightSum : null;
  const expectedDelta = rollingDailyExpected !== null ? rollingDailyExpected * elapsedDays : null;

  let allowedDeltaLow = 0;
  let allowedDeltaHigh = maxReasonableDelta;
  if (expectedDelta !== null) {
    // Tolerance scales with forecast and elapsed time so short intervals aren't over-rejected.
    const tolerance = Math.max(expectedDelta * 0.75, rollingDailyExpected ?? 0, 2);
    allowedDeltaLow = Math.max(0, expectedDelta - tolerance);
    allowedDeltaHigh = Math.min(maxReasonableDelta, expectedDelta + tolerance);
  }

  if (rawDelta >= allowedDeltaLow && rawDelta <= allowedDeltaHigh) {
    return { readingValue: rawValue, correctionNote: null, flagged: false };
  }

  const candidateValues = buildMeterReadVariants(rawValue)
    .filter((candidate) => candidate >= prevValue)
    .map((candidate) => {
      const delta = candidate - prevValue;
      const withinReasonable = delta >= allowedDeltaLow && delta <= allowedDeltaHigh;
      const expectedScore = expectedDelta !== null ? Math.abs(delta - expectedDelta) : delta;
      const digitPenalty = candidate === rawValue ? 0 : 0.01; // prefer corrected variant only when materially better
      const score = expectedScore + digitPenalty;
      return { candidate, delta, withinReasonable, score, expectedScore };
    })
    .filter((item) => item.withinReasonable || item.delta <= maxReasonableDelta)
    .sort((a, b) => a.score - b.score);

  if (candidateValues.length > 0) {
    const best = candidateValues[0];
    const rawCandidate = candidateValues.find((item) => item.candidate === rawValue);
    const shouldCorrect =
      best.candidate !== rawValue &&
      (!rawCandidate || best.expectedScore < rawCandidate.expectedScore * 0.25 || rawDelta > maxReasonableDelta);
    if (shouldCorrect) {
      return {
        readingValue: best.candidate,
        correctionNote:
          `Auto-corrected meter photo reading from ${round3(rawValue)} to ${round3(best.candidate)} ` +
          `using rolling average usage forecast since the previous ${utilityType} read ` +
          `(previous read ${round3(prevValue)}, ${round3(elapsedDays)} day interval).`,
        flagged: false
      };
    }
    return { readingValue: rawValue, correctionNote: null, flagged: false };
  }

  return {
    readingValue: rawValue,
    correctionNote:
      `Parsed meter reading ${round3(rawValue)} looks implausible versus previous read ${round3(prevValue)} ` +
      `(${round3(rawDelta)} delta over ${round3(elapsedDays)} day(s)). ` +
      (expectedDelta !== null ? `Rolling expected delta is about ${round3(expectedDelta)}. ` : "") +
      `Review manually.`,
    flagged: true
  };
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
      const manualUnitOverride = String(form.get("manualUnitOverride") || "").toLowerCase() === "true";
      let unitId = String(form.get("unitId") || "");

      if (utilityOverride && !ALLOWED_UTILITY_TYPES.has(utilityOverride)) {
        return NextResponse.json({ error: "Invalid utilityType." }, { status: 400 });
      }
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Upload file is required." }, { status: 400 });
      }
      if (mode === "meter_image") {
        const extracted = await extractMeterFromImage(file, timezone);
        const resolvedMeter = chooseMappedMeterIdentifier(extracted);
        let mapping = resolvedMeter.mapping;
        let mappedBy = "identifier";

        if (manualUnitOverride) {
          if (!unitId || !isUuid(unitId)) {
            return NextResponse.json({ error: "Valid selected unit is required for manual unit override." }, { status: 400 });
          }
          const selectedUnitName = await getUnitNameById(unitId);
          if (!selectedUnitName) {
            return NextResponse.json({ error: "Selected unit not found." }, { status: 404 });
          }
          mapping = {
            unitName: selectedUnitName,
            utilityType: "electricity",
            readingUnitDefault: "kWh",
            label: `${selectedUnitName} manual meter photo override`
          };
          mappedBy = "manual_unit_override";
        } else {
          if (!mapping) {
            return NextResponse.json(
              {
                error: `Unknown meter identifier '${normalizeMeterIdentifier(extracted.meter_identifier)}'. Add a mapping before ingest or use manual unit override.`,
                extracted
                ,
                identifierCandidatesTried: resolvedMeter.tried
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
          if (resolvedMeter.identifier && resolvedMeter.identifier !== normalizeMeterIdentifier(extracted.meter_identifier)) {
            mappedBy = "candidate_identifier_match";
          }
        }

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
        const normalization = await normalizeMeterImageReadingValue(
          unitId,
          entry.utility_type,
          entry.captured_at,
          entry.reading_value
        );
        if (normalization.flagged) {
          return NextResponse.json(
            {
              error: normalization.correctionNote || "Parsed meter reading failed validation.",
              extracted,
              mappedMeter: mapping
            },
            { status: 422 }
          );
        }
        entry.reading_value = normalization.readingValue;
        const inserted = await insertEntry(unitId, entry, `meter-image:${file.name}`);
        await dbQuery("refresh materialized view energy_weather_report");
        const stats = await getUsageStats(unitId, mapping.utilityType);
        return NextResponse.json({
          mode: "meter",
          meterIdentifier: extracted.meter_identifier,
          resolvedMeterIdentifier: resolvedMeter.identifier,
          mappedBy,
          mappedMeter: mapping,
          correctionNote: normalization.correctionNote,
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
