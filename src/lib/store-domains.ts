// Endereço das lojas sem domínio próprio: <identificador>.minhaloja.promo.
// O curinga *.minhaloja.promo está no projeto da Vercel, então basta vincular o subdomínio no /admin.
export const STORE_BASE_DOMAIN = "minhaloja.promo";

// Nomes que parecem da plataforma (ou de serviços dela) e não podem virar loja.
const RESERVED_SUBDOMAINS = new Set(["www", "admin", "painel", "api", "app", "mail", "email", "smtp", "suporte", "ajuda", "status", "blog"]);

export function storeSubdomain(slug: string) {
  return `${slug}.${STORE_BASE_DOMAIN}`;
}

export function isStoreSubdomain(host: string) {
  return host.endsWith(`.${STORE_BASE_DOMAIN}`);
}

// Recebe um domínio já normalizado. Retorna o motivo de recusa, ou null se puder ser vinculado.
export function storeDomainError(host: string): string | null {
  if (host === STORE_BASE_DOMAIN) return `${STORE_BASE_DOMAIN} é o domínio da plataforma. Use nome.${STORE_BASE_DOMAIN}.`;
  if (!isStoreSubdomain(host)) return null;
  const label = host.slice(0, -(STORE_BASE_DOMAIN.length + 1));
  // O certificado do curinga só cobre um nível: a.b.minhaloja.promo não abriria com HTTPS.
  if (label.includes(".")) return `Use um nível só: nome.${STORE_BASE_DOMAIN}.`;
  if (RESERVED_SUBDOMAINS.has(label)) return `"${label}" é um nome reservado da plataforma. Escolha outro.`;
  return null;
}
