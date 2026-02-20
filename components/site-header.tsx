import Link from "next/link";

const nav = [
  ["About", "/about"],
  ["Projects", "/projects"],
  ["Travel", "/travel-recommendations"],
  ["Blog", "/blog"],
  ["Energy Tool", "/tools/energy"],
  ["Chat", "/chat"],
  ["Contact", "/contact"]
] as const;

export default function SiteHeader() {
  return (
    <header style={{ borderBottom: "1px solid var(--line)", background: "rgba(255,255,255,.72)", backdropFilter: "blur(6px)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0.85rem 1.25rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ fontWeight: 700 }}>decosta.ca</Link>
        <nav style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="muted">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
