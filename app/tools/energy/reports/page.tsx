export default function EnergyReportsPage() {
  return (
    <div className="grid">
      <h1>Energy Reports</h1>
      <section className="card">
        <h2>Charts and Tables</h2>
        <p>Render time-series charts from approved meter readings and daily weather joins.</p>
      </section>
      <section className="card">
        <h2>Query Pattern</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>
{`SELECT day, consumption_delta, temp_avg_c, hdd
FROM energy_weather_report
WHERE unit_id = $1
ORDER BY day DESC;`}
        </pre>
      </section>
    </div>
  );
}
