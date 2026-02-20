export type Project = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  keywords: string[];
};

export const projects: Project[] = [
  {
    slug: "furnished-rental-platform",
    title: "Furnished Rental Platform",
    summary: "Lead generation and listing workflows for furnished rentals.",
    tags: ["furnished rental", "SEO", "lead generation"]
  },
  {
    slug: "energy-meter-analytics",
    title: "Energy Meter Analytics",
    summary: "Photo-based meter ingestion and weather-linked consumption reporting.",
    tags: ["OCR", "analytics", "West Vancouver"]
  },
  {
    slug: "city-recommendation-engine",
    title: "City Recommendation Knowledge Base",
    summary: "Curated recommendations indexed for low-inference conversational retrieval.",
    tags: ["RAG", "travel", "knowledge base"]
  }
];

export const blogPosts: BlogPost[] = [
  {
    slug: "furnished-rental-operations-playbook",
    title: "Furnished Rental Operations Playbook",
    excerpt: "Systems and metrics that improve occupancy and guest experience.",
    keywords: ["furnished rental", "operations"]
  },
  {
    slug: "west-vancouver-short-term-rental-trends",
    title: "West Vancouver Short-Term Rental Trends",
    excerpt: "Demand and utility insights for West Vancouver rental units.",
    keywords: ["West Vancouver", "short term rental"]
  }
];

export const cityRecommendations = [
  { city: "Vancouver", title: "Weekend Nature Loop", category: "activity" },
  { city: "Calgary", title: "Remote Work Friendly Cafes", category: "food" },
  { city: "Toronto", title: "Transit-First Neighborhood Picks", category: "stay" }
];
