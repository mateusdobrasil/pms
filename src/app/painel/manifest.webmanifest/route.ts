// Manifesto do painel como app (PWA): "Instalar app" / "Adicionar à tela de início" abre direto no painel,
// em tela cheia, com o ícone da plataforma. Escopo /painel: a vitrine das lojas não faz parte do app.
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/painel",
    name: "PMS app · Painel da loja",
    short_name: "PMS app",
    description: "Pedidos, agenda e vendas da sua loja, com aviso a cada venda.",
    lang: "pt-BR",
    start_url: "/painel",
    scope: "/painel",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f5",
    theme_color: "#171717",
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pedidos", url: "/painel/pedidos", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "Agenda", url: "/painel/agenda", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
