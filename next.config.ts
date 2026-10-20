import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents fica desligado por enquanto: as rotas da vitrine dependem do domínio
  // (multi-tenant) e usamos o modelo de cache anterior (revalidate / fetch).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
