#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/import-bills.mjs --unit \"House\" [--timezone \"America/Vancouver\"] [--utility-type electricity|gas|water] [--entry-type meter_read|billed_usage] [--period-start YYYY-MM-DD] [--period-end YYYY-MM-DD] [--apply] <pdf1> <pdf2> ...",
      "",
      "Defaults:",
      "  --timezone America/Vancouver",
      "  autodetect utility and entry types from bill content",
      "  dry-run mode unless --apply is passed"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    unit: "",
    timezone: "America/Vancouver",
    utilityType: "",
    entryType: "",
    periodStart: "",
    periodEnd: "",
    apply: false,
    files: []
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--unit") {
      args.unit = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--timezone") {
      args.timezone = argv[i + 1] ?? "America/Vancouver";
      i += 1;
      continue;
    }
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--utility-type") {
      args.utilityType = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--entry-type") {
      args.entryType = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--period-start") {
      args.periodStart = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--period-end") {
      args.periodEnd = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    args.files.push(token);
  }

  return args;
}

function getTextFromResponsePayload(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => part.text || part.output_text || "")
    .join("\n");
}

function normalizeEntry(raw, defaults, sourceFilename, sourceIndex) {
  const entryType = raw.entry_type || defaults.entryType || "meter_read";
  const utilityType = raw.utility_type || defaults.utilityType || "electricity";
  const readingUnit = raw.reading_unit || (utilityType === "gas" ? "GJ" : "kWh");
  const capturedAt = raw.captured_at;
  const readingValue = Number(raw.reading_value);
  const periodStart = raw.period_start || defaults.periodStart || null;
  const periodEnd = raw.period_end || defaults.periodEnd || null;
  const confidence = Number(raw.confidence ?? 0.8);
  const evidence = String(raw.evidence ?? "");
  const billId = raw.bill_id ? String(raw.bill_id) : sourceFilename.replace(/\.pdf$/i, "");
  const isOpening = typeof raw.is_opening === "boolean" ? raw.is_opening : null;

  return {
    source_filename: sourceFilename,
    source_index: sourceIndex,
    entry_type: entryType,
    utility_type: utilityType,
    captured_at: capturedAt,
    reading_value: readingValue,
    reading_unit: readingUnit,
    period_start: periodStart,
    period_end: periodEnd,
    confidence,
    evidence,
    bill_id: billId,
    is_opening: isOpening
  };
}

async function extractFromPdf(filePath, timezone, apiKey, defaults) {
  const bytes = await fs.readFile(filePath);
  const b64 = bytes.toString("base64");
  const filename = path.basename(filePath);

  const prompt = [
    "Extract utility entries from this bill PDF and return STRICT JSON only.",
    "Schema:",
    '{"entries":[{"entry_type":"meter_read|billed_usage","utility_type":"electricity|gas|water","captured_at":"ISO8601","reading_value":number,"reading_unit":"kWh|m3|GJ|...","period_start":"YYYY-MM-DD|null","period_end":"YYYY-MM-DD|null","is_opening":true|false|null,"bill_id":"string|null","confidence":number,"evidence":"short source text"}]}',
    `Timezone for dates/times: ${timezone}.`,
    "Rules:",
    "- Include both meter opening/closing reads when present.",
    "- Include billed period totals (e.g., gas GJ usage) as billed_usage with period_start/period_end.",
    "- If no exact time is shown, use 00:00 in the provided timezone.",
    "- Do not invent values not visible on the bill."
  ].join("\n");

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
              file_data: `data:application/pdf;base64,${b64}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI extraction failed for ${filename}: ${details}`);
  }

  const payload = await response.json();
  const text = getTextFromResponsePayload(payload);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    const preview = JSON.stringify(payload).slice(0, 600);
    throw new Error(`No JSON object returned for ${filename}. response preview: ${preview}`);
  }

  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`Invalid JSON shape for ${filename}.`);
  }

  return parsed.entries.map((row, idx) => normalizeEntry(row, defaults, filename, idx + 1));
}

function validateEntry(entry) {
  if (!["meter_read", "billed_usage"].includes(entry.entry_type)) return false;
  if (!["electricity", "gas", "water"].includes(entry.utility_type)) return false;
  if (!entry.captured_at || !Number.isFinite(entry.reading_value)) return false;
  if (entry.entry_type === "billed_usage" && (!entry.period_start || !entry.period_end)) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.OPENAI_API_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!args.unit || args.files.length === 0) {
    usage();
    process.exit(1);
  }
  if (args.utilityType && !["electricity", "gas", "water"].includes(args.utilityType)) {
    throw new Error("Invalid --utility-type. Use electricity|gas|water.");
  }
  if (args.entryType && !["meter_read", "billed_usage"].includes(args.entryType)) {
    throw new Error("Invalid --entry-type. Use meter_read|billed_usage.");
  }
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  if (!databaseUrl) throw new Error("Missing DATABASE_URL.");

  const extracted = [];
  for (const filePath of args.files) {
    const rows = await extractFromPdf(filePath, args.timezone, apiKey, {
      utilityType: args.utilityType || null,
      entryType: args.entryType || null,
      periodStart: args.periodStart || null,
      periodEnd: args.periodEnd || null
    });
    extracted.push(...rows);
  }

  const filtered = extracted.filter((row) => {
    if (!validateEntry(row)) return false;
    if (args.utilityType && row.utility_type !== args.utilityType) return false;
    if (args.entryType && row.entry_type !== args.entryType) return false;
    return true;
  });

  console.log(`Extracted ${filtered.length} valid entry row(s).`);
  console.table(
    filtered.map((r) => ({
      file: r.source_filename,
      utility_type: r.utility_type,
      entry_type: r.entry_type,
      captured_at: r.captured_at,
      reading_value: r.reading_value,
      reading_unit: r.reading_unit,
      period_start: r.period_start,
      period_end: r.period_end,
      is_opening: r.is_opening,
      bill_id: r.bill_id,
      confidence: r.confidence
    }))
  );

  if (!args.apply) {
    console.log("Dry-run only. Re-run with --apply to write rows to meter_reading.");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const unitRes = await pool.query("select id from rental_unit where unit_name = $1 limit 1", [args.unit]);
    if (unitRes.rowCount === 0) {
      throw new Error(`Unit not found: ${args.unit}. Create it first in rental_unit.`);
    }
    const unitId = unitRes.rows[0].id;

    let inserted = 0;
    let skipped = 0;
    for (const row of filtered) {
      const exists = await pool.query(
        `select 1
         from meter_reading
         where unit_id = $1
           and utility_type = $2
           and entry_type = $3
           and captured_at = $4::timestamptz
           and reading_value = $5::numeric
         limit 1`,
        [unitId, row.utility_type, row.entry_type, row.captured_at, row.reading_value]
      );
      if (exists.rowCount > 0) {
        skipped += 1;
        continue;
      }

      await pool.query(
        `insert into meter_reading (
          unit_id, image_url, reading_value, reading_unit, captured_at,
          parsed_at, parser_confidence, parse_status, utility_type, entry_type,
          period_start, period_end, bill_id, is_opening, source, weather_day
        ) values (
          $1, $2, $3, $4, $5::timestamptz,
          now(), $6, 'approved', $7, $8, $9, $10, $11, $12, 'manual',
          ($5::timestamptz at time zone 'America/Vancouver')::date
        )`,
        [
          unitId,
          `pdf:${row.source_filename}#${row.source_index}`,
          row.reading_value,
          row.reading_unit,
          row.captured_at,
          row.confidence,
          row.utility_type,
          row.entry_type,
          row.period_start,
          row.period_end,
          row.bill_id,
          row.is_opening
        ]
      );
      inserted += 1;
    }

    await pool.query("refresh materialized view energy_weather_report");
    console.log(`Insert complete. inserted=${inserted}, skipped=${skipped}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

