import EnergyIngestConsole from "@/components/energy-ingest-console";

export const metadata = {
  title: "Energy Meter Tool",
  description: "Upload meter photos, parse readings, and compare usage with West Vancouver weather."
};

export default function EnergyToolPage() {
  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <h1>Energy Meter Analytics</h1>
      <section className="card">
        <h2>Ingest Workflow</h2>
        <ol>
          <li>Add a meter read manually or upload a bill PDF</li>
          <li>AI extracts entries and writes to the database</li>
          <li>View immediate usage stats (latest delta, 30-day usage, since last billing)</li>
          <li>Compare against West Vancouver weather in reports</li>
        </ol>
      </section>
      <section className="card">
        <h2>Endpoints</h2>
        <p className="muted"><code>POST /api/energy/ingest</code> for manual entries and bill PDFs.</p>
        <p className="muted"><code>GET /api/energy/reports</code> for usage + weather reporting.</p>
      </section>
      <EnergyIngestConsole />
    </div>
  );
}
