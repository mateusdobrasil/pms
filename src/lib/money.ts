// Todos os valores trafegam em centavos (inteiros). Formate só na exibição.
export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
