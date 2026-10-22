// Ordenações da vitrine (?ordem=...). Compartilhado entre a grade (servidor) e o seletor (navegador).
export const SORTS = [
  { value: "destaques", label: "Destaques" },
  { value: "novidades", label: "Novidades" },
  { value: "menor-preco", label: "Menor preço" },
  { value: "maior-preco", label: "Maior preço" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

export const parseSort = (value: string | undefined): Sort =>
  SORTS.find((s) => s.value === value)?.value ?? "destaques";
