export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: "2rem" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "1rem 1.25rem" }}>
        <p className="muted">
          Related sites: <a href="https://furnished-finder.ca" target="_blank" rel="noreferrer">furnished-finder.ca</a> | <a href="https://westcoasthavens.com" target="_blank" rel="noreferrer">westcoasthavens.com</a>
        </p>
      </div>
    </footer>
  );
}
