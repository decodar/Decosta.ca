import Link from "next/link";
import { projects } from "@/lib/data";

export default function ProjectsPage() {
  return (
    <div className="grid">
      <h1>Projects</h1>
      <section className="grid grid-2">
        {projects.map((project) => (
          <article className="card" key={project.slug}>
            <h2><Link href={`/projects/${project.slug}`}>{project.title}</Link></h2>
            <p className="muted">{project.summary}</p>
            <p>{project.tags.join(" | ")}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
