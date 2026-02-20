export default function ContactPage() {
  return (
    <div className="grid">
      <h1>Contact</h1>
      <section className="card">
        <h2>Work With Me</h2>
        <p>Use this page for consulting, full-time opportunities, and partnership inquiries.</p>
        <form className="grid">
          <label>
            Name
            <input name="name" style={{ display: "block", width: "100%", padding: ".55rem", marginTop: ".3rem" }} />
          </label>
          <label>
            Email
            <input name="email" type="email" style={{ display: "block", width: "100%", padding: ".55rem", marginTop: ".3rem" }} />
          </label>
          <label>
            Message
            <textarea name="message" rows={6} style={{ display: "block", width: "100%", padding: ".55rem", marginTop: ".3rem" }} />
          </label>
          <button className="btn" type="submit">Send</button>
        </form>
      </section>
    </div>
  );
}
