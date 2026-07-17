import type { MetadataRoute } from "next";
import {
  getDeploymentWebsiteUrl,
} from "@/config/branding";

export default function robots(): MetadataRoute.Robots {
  const deploymentWebsiteUrl = getDeploymentWebsiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    ...(deploymentWebsiteUrl
      ? { sitemap: new URL("/sitemap.xml", deploymentWebsiteUrl).toString() }
      : {}),
  };
}
