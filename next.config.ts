import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents fica desligado por enquanto: as rotas da vitrine dependem do domínio
  // (multi-tenant) e usamos o modelo de cache anterior (revalidate / fetch).
  experimental: {
    // Logo da loja enviado pelo super-admin passa pela server action (até 2 MB + campos).
    serverActions: { bodySizeLimit: "3mb" },
  },
  // Manuais lidos do disco pelas rotas de ajuda: precisam ir junto no deploy.
  outputFileTracingIncludes: {
    "/painel/manual-lojista": ["./docs/manuais/manual-lojista.html"],
    "/admin/manual-operacao": ["./docs/manuais/manual-operacao.html"],
  },
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
