import Link from "next/link";
import { blogPosts, projects } from "@/lib/data";

export default function HomePage() {
  return (
    <div className="grid" style={{ gap: "1.4rem" }}>
      <section className="card">
        <span className="badge">Portfolio + AI Assistant + Ops Tools</span>
        <h1>Darrin DeCosta: Entrepreneur blending Technology and Business Acumen</h1>
        <p className="muted">
          To me, being tech native means the ability to leverage technology to solve problems at scale.  I am a serial entrepreneur with a passion for building businesses and products that make a difference.  Currently, you can find me working on Revidera-ai.com, an AI and Expert Practitioner lead recruiting service designed to find True Capability in Candidates
        </p>
        <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/contact">Request Consulting Services</Link>
          <Link className="btn btn-secondary" href="/chat">Ask AI about Me</Link>
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

     {/*  <section className="card">
        <h2>Keyword Hubs</h2>
        <p className="muted">Target pages for furnished rental, West Vancouver, and short term rental queries.</p>
        <ul>
          <li><Link href="/blog/furnished-rental-operations-playbook">Furnished Rental Operations</Link></li>
          <li><Link href="/blog/west-vancouver-short-term-rental-trends">West Vancouver Short-Term Rental</Link></li>
          <li><Link href="/tools/energy">Rental Utility Analytics Tool</Link></li>
        </ul>
      </section> */}

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
