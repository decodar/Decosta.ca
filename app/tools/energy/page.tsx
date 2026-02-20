export const metadata = {
  title: "Energy Meter Tool",
  description: "Upload meter photos, parse readings, and compare usage with West Vancouver weather."
};

export default function EnergyToolPage() {
  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <h1>Energy Meter Analytics</h1>
      <section className="card">
        <h2>Upload Workflow</h2>
        <ol>
          <li>Upload a meter photo</li>
          <li>Parse reading + timestamp</li>
          <li>Store in database with review status</li>
          <li>Compare against West Vancouver weather</li>
        </ol>
      </section>
      <section className="card">
        <h2>Parse Endpoint</h2>
        <p className="muted">POST image metadata or base64 payload to <code>/api/meter-parse</code>.</p>
      </section>
      <section className="card">
        <h2>Sample Readings</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Captured At</th>
              <th>Reading</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Unit A</td>
              <td>2026-02-19 08:30</td>
              <td>15432.2 kWh</td>
              <td>pending_review</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
