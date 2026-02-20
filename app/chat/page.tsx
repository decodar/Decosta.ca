export default function ChatPage() {
  return (
    <div className="grid">
      <h1>Portfolio Chat</h1>
      <section className="card">
        <h2>Modes</h2>
        <p>Projects | Experience | City Recommendations</p>
        <p className="muted">
          Frontend chat UI can call <code>/api/chat</code> with the selected mode and user message.
        </p>
      </section>
      <section className="card">
        <h2>Guardrails</h2>
        <ul>
          <li>RAG-only answers</li>
          <li>Required source citations</li>
          <li>Low inference policy</li>
        </ul>
      </section>
    </div>
  );
}
