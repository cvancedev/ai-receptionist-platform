import type { MetadataRoute } from "next";
import { branding } from "@/config/branding";

const routes = [
  { path: "/", changeFrequency: "monthly", priority: 1 },
  { path: "/early-access", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const websiteUrl = new URL(branding.websiteUrl);

  return routes.map((route) => ({
    url: new URL(route.path, websiteUrl).toString(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
