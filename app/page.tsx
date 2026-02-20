import Link from "next/link";
import { blogPosts, projects } from "@/lib/data";

export default function HomePage() {
  return (
    <div className="grid" style={{ gap: "1.4rem" }}>
      <section className="card">
        <span className="badge">Portfolio + AI Assistant + Ops Tools</span>
        <h1>Decosta: rental, travel, and analytics expertise</h1>
        <p className="muted">
          I build and operate systems for furnished rentals, guest experiences, and data-driven operations.
        </p>
        <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/contact">Hire for Consulting / Full-time</Link>
          <Link className="btn btn-secondary" href="/chat">Ask Portfolio AI</Link>
        </div>
      </section>

      <section className="grid grid-2">
        {projects.map((project) => (
          <article className="card" key={project.slug}>
            <h3>
              <Link href={`/projects/${project.slug}`}>{project.title}</Link>
            </h3>
            <p className="muted">{project.summary}</p>
            <p>{project.tags.join(" | ")}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Keyword Hubs</h2>
        <p className="muted">Target pages for furnished rental, West Vancouver, and short term rental queries.</p>
        <ul>
          <li><Link href="/blog/furnished-rental-operations-playbook">Furnished Rental Operations</Link></li>
          <li><Link href="/blog/west-vancouver-short-term-rental-trends">West Vancouver Short-Term Rental</Link></li>
          <li><Link href="/tools/energy">Rental Utility Analytics Tool</Link></li>
        </ul>
      </section>

      <section className="grid grid-2">
        {blogPosts.map((post) => (
          <article className="card" key={post.slug}>
            <h3>
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h3>
            <p className="muted">{post.excerpt}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
