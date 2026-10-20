import type { MetadataRoute } from "next";

// robots.txt do site da plataforma (as lojas têm o próprio, em /s/[domain]/robots.txt).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/admin", "/api"] },
  };
}
