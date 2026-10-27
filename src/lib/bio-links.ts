import { isValidBannerLink } from "@/lib/banner";

// Página de links para a bio do Instagram: links extras do lojista (Google Maps, iFood, catálogo...).
export type BioLink = { title: string; url: string };
export const MAX_BIO_LINKS = 6;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

// Lido do banco: ignora o que estiver fora do formato (nunca quebra a página).
export function readBioLinks(raw: unknown): BioLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ title: clean(l?.title, 40), url: clean(l?.url, 500) }))
    .filter((l) => l.title && isValidBannerLink(l.url))
    .slice(0, MAX_BIO_LINKS);
}

// Do formulário (pares título/endereço, linhas vazias ignoradas). "instagram.com/x" vira "https://instagram.com/x".
export function parseBioLinks(titles: unknown[], urls: unknown[]): { links: BioLink[] } | { error: string } {
  const links: BioLink[] = [];
  for (let i = 0; i < Math.max(titles.length, urls.length); i++) {
    const title = clean(titles[i], 40);
    let url = clean(urls[i], 500);
    if (!title && !url) continue;
    if (!title) return { error: `Dê um nome ao link ${i + 1}.` };
    if (url && !url.startsWith("/") && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/^http:\/\//i, "https://");
    if (!isValidBannerLink(url)) return { error: `Endereço inválido em "${title}": use um link https:// ou um caminho da loja (ex.: /c/promocoes).` };
    links.push({ title, url });
  }
  if (links.length > MAX_BIO_LINKS) return { error: `No máximo ${MAX_BIO_LINKS} links extras.` };
  return { links };
}
