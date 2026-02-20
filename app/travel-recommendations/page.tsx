import { cityRecommendations } from "@/lib/data";

export const metadata = {
  title: "City Recommendations",
  description: "Curated city recommendations sourced from lived experience and project content."
};

export default function TravelRecommendationsPage() {
  return (
    <div className="grid">
      <h1>City Recommendations</h1>
      <p className="muted">Curated suggestions. Chat responses should only use this published content.</p>
      <section className="grid grid-2">
        {cityRecommendations.map((item) => (
          <article className="card" key={`${item.city}-${item.title}`}>
            <p className="badge">{item.city}</p>
            <h3>{item.title}</h3>
            <p className="muted">Category: {item.category}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
