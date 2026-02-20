export default function AboutPage() {
  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <h1>About</h1>
      <section className="card">
        <h2>Resume Summary</h2>
        <p>
          Add your full summary, timeline, and role details here. This page should mirror the curated data loaded into the AI retrieval index.
        </p>
      </section>
      <section className="card">
        <h2>Skills Matrix</h2>
        <p className="muted">AI integration, rental operations, SEO, analytics, and product execution.</p>
      </section>
    </div>
  );
}
