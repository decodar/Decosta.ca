import { notFound } from "next/navigation";
import { projects } from "@/lib/data";

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);

  if (!project) {
    notFound();
  }

  return (
    <article className="grid">
      <h1>{project.title}</h1>
      <section className="card">
        <h2>Problem</h2>
        <p>Document the operational or technical problem this project addressed.</p>
      </section>
      <section className="card">
        <h2>Approach</h2>
        <p>Add implementation details, stack, and why decisions were made.</p>
      </section>
      <section className="card">
        <h2>Outcome</h2>
        <p>{project.summary}</p>
      </section>
    </article>
  );
}
