import type { MetadataRoute } from "next";

const routes = [
  "",
  "/about",
  "/projects",
  "/travel-recommendations",
  "/blog",
  "/tools/energy",
  "/tools/energy/reports",
  "/chat",
  "/contact"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://decosta.ca";
  const now = new Date();

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7
  }));
}
