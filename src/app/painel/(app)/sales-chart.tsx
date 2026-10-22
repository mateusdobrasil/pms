"use client";

import { formatBRL } from "@/lib/money";
import { type DayPoint, type TopProduct } from "@/lib/sales";
import { ColumnChart } from "@/lib/column-chart";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
const ordersLabel = (n: number) => (n === 1 ? "1 pedido" : `${n} pedidos`);

// Vendas por dia: colunas (ColumnChart) + a mesma informação em tabela.
export function SalesChart({ points }: { points: DayPoint[] }) {
  const columns = points.map((p, i) => ({
    key: p.date,
    cents: p.cents,
    // Datas: uma a cada 7 dias e o último dia ("hoje"), sem encavalar.
    axisLabel: i === points.length - 1 ? "hoje" : i % 7 === 0 && i < points.length - 4 ? shortDate(p.date) : undefined,
    title: `${weekday(p.date)}, ${shortDate(p.date)}`,
    detail: ordersLabel(p.orders),
  }));

  return (
    <div>
      <ColumnChart columns={columns} />

      <details className="mt-7 text-sm">
        <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">Ver em tabela</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Pedidos</th>
              <th className="py-1 text-right font-medium">Vendas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {points
              .filter((p) => p.orders > 0)
              .reverse()
              .map((p) => (
                <tr key={p.date}>
                  <td className="py-1.5">{weekday(p.date)}, {shortDate(p.date)}</td>
                  <td className="py-1.5 text-right">{p.orders}</td>
                  <td className="py-1.5 text-right">{formatBRL(p.cents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// Mais vendidos: barras horizontais (mesma cor), valor na ponta.
export function TopProducts({ products }: { products: TopProduct[] }) {
  const max = Math.max(...products.map((p) => p.cents), 1);
  return (
    <ol className="space-y-3">
      {products.map((p, i) => (
        <li key={p.name} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 text-neutral-400">{i + 1}.</span>
              {p.name}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">{p.quantity === 1 ? "1 unidade" : `${p.quantity} unidades`}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="block h-2.5 rounded-r-[4px] bg-primary-500" style={{ width: `${Math.max((p.cents / max) * 75, 2)}%` }} />
            <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-700">{formatBRL(p.cents)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
