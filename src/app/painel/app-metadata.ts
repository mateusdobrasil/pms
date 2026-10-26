import type { Metadata, Viewport } from "next";

// Painel como app instalável (PWA): manifesto, ícone do iPhone e cor da barra do celular.
// Usado no layout do painel e no login (o app instalado abre no login quando a sessão expira).
export const panelAppMetadata: Metadata = {
  manifest: "/painel/manifest.webmanifest",
  icons: { apple: "/brand/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PMS app", statusBarStyle: "black" },
};

export const panelViewport: Viewport = { themeColor: "#171717" };
