// Endereço público de uma loja a partir do domínio (em dev, *.localhost na porta 3000).
export function storeBaseUrl(domain: string) {
  return domain.endsWith(".localhost") ? `http://${domain}:3000` : `https://${domain}`;
}

// Endereço do painel/site da plataforma (PLATFORM_URL, ex.: https://www.pmsapp.dev; em dev, localhost).
export function platformUrl(path = "") {
  return `${(process.env.PLATFORM_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
