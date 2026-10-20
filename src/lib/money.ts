// Todos os valores trafegam em centavos (inteiros). Formate só na exibição.
export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "1.234,56" | "79,9" | "R$ 10" → centavos. Retorna null se inválido.
export function parseBRL(input: string): number | null {
  const s = input.replace(/R\$|\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

// Centavos → texto para campo de formulário ("79,90").
export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
