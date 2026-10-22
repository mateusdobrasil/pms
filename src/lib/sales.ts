// Séries do Resumo do lojista (gráfico de vendas e mais vendidos). Funções puras, testadas em tests/sales.test.ts.
// Datas "AAAA-MM-DD" no fuso de Brasília.

export type DayPoint = { date: string; cents: number; orders: number };
export type TopProduct = { name: string; cents: number; quantity: number };

// Dia de Brasília de um instante (sem horário de verão desde 2019).
export const dayBR = (iso: string) => new Date(Date.parse(iso) - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Primeiro dia da janela que termina hoje (inclusive): 30 dias = hoje e os 29 anteriores.
export const windowStart = (today: string, days: number) => shift(today, -(days - 1));

// Um ponto por dia, com zero nos dias sem venda (o gráfico não pode pular dias).
export function dailySales(orders: { total_cents: number; paid_at: string }[], today: string, days = 30): DayPoint[] {
  const start = windowStart(today, days);
  const points = Array.from({ length: days }, (_, i) => ({ date: shift(start, i), cents: 0, orders: 0 }));
  const index = new Map(points.map((p, i) => [p.date, i]));
  for (const o of orders) {
    const i = index.get(dayBR(o.paid_at));
    if (i === undefined) continue;
    points[i].cents += o.total_cents;
    points[i].orders += 1;
  }
  return points;
}

// Produtos que mais faturaram (valor dos itens), agrupados pelo nome gravado no pedido.
export function topProducts(items: { product_name: string; unit_price_cents: number; quantity: number }[], limit = 5): TopProduct[] {
  const byName = new Map<string, TopProduct>();
  for (const it of items) {
    const row = byName.get(it.product_name) ?? { name: it.product_name, cents: 0, quantity: 0 };
    row.cents += it.unit_price_cents * it.quantity;
    row.quantity += it.quantity;
    byName.set(it.product_name, row);
  }
  return [...byName.values()].sort((a, b) => b.cents - a.cents || b.quantity - a.quantity).slice(0, limit);
}

// Topo "redondo" do eixo e 2 marcas intermediárias: 0 · 1/2 · topo (em centavos).
export function axisTop(maxCents: number) {
  if (maxCents <= 0) return 10_000; // R$ 100 de referência num gráfico vazio
  const reais = maxCents / 100;
  const magnitude = 10 ** Math.floor(Math.log10(reais));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= reais)! * magnitude;
  return Math.round(step * 100);
}

// "R$ 1,25 mil" / "R$ 850" para os rótulos do eixo.
export function compactBRL(cents: number) {
  const reais = cents / 100;
  if (reais >= 1000) return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mil`;
  return `R$ ${reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
