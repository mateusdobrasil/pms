// Endereço público de uma loja a partir do domínio (em dev, *.localhost na porta 3000).
export function storeBaseUrl(domain: string) {
  return domain.endsWith(".localhost") ? `http://${domain}:3000` : `https://${domain}`;
}
