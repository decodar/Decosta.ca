import { notFound } from "next/navigation";
import { blogPosts } from "@/lib/data";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogPosts.find((item) => item.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="grid">
      <h1>{post.title}</h1>
      <p className="muted">{post.excerpt}</p>
      <section className="card">
        <p>
          Replace this with your complete markdown-rendered post body. Target keyword cluster: {post.keywords.join(", ")}.
        </p>
      </section>
    </article>
  );
}
