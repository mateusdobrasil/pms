// Termos de busca normalizados como products.search_name (sem acento, minúsculos).
// Cada palavra vira um filtro: "modeladora pomada" acha "Pomada Modeladora".
export function searchTerms(q: string) {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}
