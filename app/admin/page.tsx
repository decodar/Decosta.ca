export default function AdminPage() {
  return (
    <div className="grid">
      <h1>Admin</h1>
      <section className="card">
        <h2>Content Management</h2>
        <p>Manage projects, city recommendations, blog posts, and resume data.</p>
      </section>
      <section className="card">
        <h2>OCR Review Queue</h2>
        <p>Approve or reject parsed meter readings before report inclusion.</p>
      </section>
    </div>
  );
}
