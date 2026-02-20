import Link from "next/link";
import { blogPosts } from "@/lib/data";

export default function BlogPage() {
  return (
    <div className="grid">
      <h1>Blog</h1>
      <section className="grid">
        {blogPosts.map((post) => (
          <article className="card" key={post.slug}>
            <h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2>
            <p className="muted">{post.excerpt}</p>
            <p>{post.keywords.join(" | ")}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
