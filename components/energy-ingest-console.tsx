"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getAllowedUtilitiesForUnitName } from "@/lib/unit-utility-policy";

type Unit = { id: string; unit_name: string; meter_type: string };

type IngestResponse = {
  mode: "meter" | "bill";
  insertedCount: number;
  inserted: Array<{
    id: string;
    utility_type: string;
    entry_type: string;
    captured_at: string;
    reading_value: string;
    reading_unit: string;
  }>;
  statsByUtility: Record<
    string,
    {
      latestDelta: { usage: number; days: number; avgPerDay: number; unit: string } | null;
      usage30d: number;
      usage30dUnit: string | null;
      sinceLastBilling: { usage: number; unit: string; fromDate: string } | null;
    }
  >;
};

function getCurrentLocalDateTimeInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function EnergyIngestConsole() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [utilityType, setUtilityType] = useState("electricity");

  const [readingValue, setReadingValue] = useState("");
  const [readingUnit, setReadingUnit] = useState("kWh");
  const [capturedAt, setCapturedAt] = useState(getCurrentLocalDateTimeInputValue);
  const [entryType, setEntryType] = useState("meter_read");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [billId, setBillId] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [meterImageFile, setMeterImageFile] = useState<File | null>(null);
  const [useManualMeterUnitOverride, setUseManualMeterUnitOverride] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/energy/reports?days=1");
      const json = (await response.json()) as { units?: Unit[] };
      const fetchedUnits = json.units || [];
      setUnits(fetchedUnits);
      if (fetchedUnits.length > 0) {
        setSelectedUnitId(fetchedUnits[0].id);
      }
    })();
  }, []);

  const hasPeriod = entryType === "billed_usage";
  const isMeterReadEntry = entryType === "meter_read";

  useEffect(() => {
    if (isMeterReadEntry) {
      if (utilityType === "electricity") {
        setReadingUnit("kWh");
        return;
      }
      if (utilityType === "gas" || utilityType === "water") {
        setReadingUnit("m3");
        return;
      }
      return;
    }

    // Billed usage entries (especially gas) often use energy units like GJ.
    if (utilityType === "gas" && readingUnit === "m3") {
      setReadingUnit("GJ");
    }
  }, [utilityType, isMeterReadEntry, readingUnit]);
  const selectedUnitName = useMemo(
    () => units.find((unit) => unit.id === selectedUnitId)?.unit_name ?? "Selected Unit",
    [units, selectedUnitId]
  );
  const allowedUtilities = useMemo(() => getAllowedUtilitiesForUnitName(selectedUnitName), [selectedUnitName]);

  useEffect(() => {
    if (!allowedUtilities.includes(utilityType as "electricity" | "gas" | "water")) {
      setUtilityType(allowedUtilities[0]);
    }
  }, [allowedUtilities, utilityType]);

  async function onSubmitMeter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/energy/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "meter",
          unitId: selectedUnitId,
          utilityType,
          readingValue: Number(readingValue),
          readingUnit,
          capturedAt: new Date(capturedAt).toISOString(),
          entryType,
          periodStart: hasPeriod ? periodStart : null,
          periodEnd: hasPeriod ? periodEnd : null,
          billId: billId || null,
          isOpening: entryType === "meter_read" ? isOpening : null
        })
      });
      const json = (await response.json()) as IngestResponse & { error?: string; details?: string };
      if (!response.ok) {
        throw new Error(json.details || json.error || "Failed to ingest meter reading.");
      }
      setResult(json);
      setCapturedAt(getCurrentLocalDateTimeInputValue());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billFile) {
      setError("Please select a PDF bill first.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("mode", "bill");
      form.set("unitId", selectedUnitId);
      form.set("utilityType", utilityType);
      form.set("timezone", "America/Vancouver");
      form.set("file", billFile);

      const response = await fetch("/api/energy/ingest", {
        method: "POST",
        body: form
      });
      const json = (await response.json()) as IngestResponse & { error?: string; details?: string };
      if (!response.ok) {
        throw new Error(json.details || json.error || "Failed to ingest bill.");
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitMeterImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meterImageFile) {
      setError("Please select a meter image first.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("mode", "meter_image");
      form.set("unitId", selectedUnitId);
      form.set("timezone", "America/Vancouver");
      if (useManualMeterUnitOverride) {
        form.set("manualUnitOverride", "true");
      }
      form.set("file", meterImageFile);

      const response = await fetch("/api/energy/ingest", {
        method: "POST",
        body: form
      });
      const json = (await response.json()) as IngestResponse & { error?: string; details?: string };
      if (!response.ok) {
        throw new Error(json.details || json.error || "Failed to ingest meter image.");
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <h2>Add Meter Reading</h2>
        <form className="grid grid-2" onSubmit={onSubmitMeter}>
          <label>
            Unit
            <select value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }}>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unit_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Utility
            <select value={utilityType} onChange={(event) => setUtilityType(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }}>
              {allowedUtilities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entry Type
            <select value={entryType} onChange={(event) => setEntryType(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }}>
              <option value="meter_read">meter_read</option>
              <option value="billed_usage">billed_usage</option>
            </select>
          </label>
          <label>
            Captured At
            <input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }} />
          </label>
          <label>
            Value
            <input value={readingValue} onChange={(event) => setReadingValue(event.target.value)} placeholder="e.g. 184" style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }} />
          </label>
          <label>
            Unit
            <input
              value={readingUnit}
              onChange={(event) => setReadingUnit(event.target.value)}
              placeholder="kWh | m3 | GJ"
              disabled={isMeterReadEntry}
              style={{
                display: "block",
                width: "100%",
                marginTop: ".3rem",
                padding: ".5rem",
                background: isMeterReadEntry ? "#f3f1ed" : undefined
              }}
            />
          </label>
          {hasPeriod && (
            <>
              <label>
                Period Start
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }} />
              </label>
              <label>
                Period End
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }} />
              </label>
            </>
          )}
          <label>
            Bill ID (optional)
            <input value={billId} onChange={(event) => setBillId(event.target.value)} style={{ display: "block", width: "100%", marginTop: ".3rem", padding: ".5rem" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: "1.7rem" }}>
            <input type="checkbox" checked={isOpening} onChange={(event) => setIsOpening(event.target.checked)} disabled={entryType !== "meter_read"} />
            Opening meter read
          </label>
          <button className="btn" type="submit" disabled={loading || !selectedUnitId}>
            {loading ? "Submitting..." : "Add Entry"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--line)", marginTop: "1rem", paddingTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Or Upload Meter Photo (AI Read + Insert)</h3>
          <form className="grid" onSubmit={onSubmitMeterImage}>
            <p className="muted">AI reads the meter identifier and kWh from the image, maps it to a unit, inserts the reading, and returns updated usage stats. If it picks the wrong identifier, enable manual unit override and use the selected unit.</p>
            <label style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
              <input
                type="checkbox"
                checked={useManualMeterUnitOverride}
                onChange={(event) => setUseManualMeterUnitOverride(event.target.checked)}
              />
              Use selected unit instead of AI meter identifier mapping
            </label>
            <label>
              Meter Image
              <input type="file" accept="image/*,.heic,.heif" onChange={(event) => setMeterImageFile(event.target.files?.[0] ?? null)} style={{ display: "block", marginTop: ".3rem" }} />
            </label>
            <button className="btn" type="submit" disabled={loading || !selectedUnitId || !meterImageFile}>
              {loading ? "Reading..." : "Process Meter Photo"}
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2>Upload Bill PDF (AI Extract + Insert)</h2>
        <form className="grid" onSubmit={onSubmitBill}>
          <p className="muted">AI will extract entries (meter reads and billed usage), write them to the database, and return updated stats.</p>
          <label>
            Bill File (PDF)
            <input type="file" accept="application/pdf" onChange={(event) => setBillFile(event.target.files?.[0] ?? null)} style={{ display: "block", marginTop: ".3rem" }} />
          </label>
          <button className="btn" type="submit" disabled={loading || !selectedUnitId || !billFile}>
            {loading ? "Processing..." : "Process Bill"}
          </button>
        </form>
      </section>

      {error && (
        <section className="card" style={{ borderColor: "#b42318" }}>
          <h3>Error</h3>
          <p>{error}</p>
        </section>
      )}

      {result && (
        <section className="card">
          <h2>Ingest Result</h2>
          <p>
            Inserted <strong>{result.insertedCount}</strong> row(s) for <strong>{selectedUnitName}</strong>.
          </p>
          <h3>Stats</h3>
          {Object.entries(result.statsByUtility).map(([utility, stats]) => (
            <div key={utility} className="card" style={{ marginTop: ".5rem" }}>
              <p>
                <strong>{utility}</strong>
              </p>
              <p>30-day usage: {stats.usage30d} {stats.usage30dUnit ?? ""}</p>
              <p>
                Latest interval:
                {" "}
                {stats.latestDelta ? `${stats.latestDelta.usage} ${stats.latestDelta.unit} over ${stats.latestDelta.days} day(s), avg ${stats.latestDelta.avgPerDay}/day` : "not enough reads yet"}
              </p>
              <p>
                Since last billed period:
                {" "}
                {stats.sinceLastBilling ? `${stats.sinceLastBilling.usage} ${stats.sinceLastBilling.unit} since ${stats.sinceLastBilling.fromDate}` : "no billed period baseline yet"}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
