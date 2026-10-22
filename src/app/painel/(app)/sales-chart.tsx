"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";
import { type DayPoint, type TopProduct, axisTop, compactBRL } from "@/lib/sales";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
const ordersLabel = (n: number) => (n === 1 ? "1 pedido" : `${n} pedidos`);

// Colunas de vendas por dia (uma série: cor da marca, sem legenda; o título diz o que é).
export function SalesChart({ points }: { points: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.cents));
  const top = axisTop(max);
  const best = max > 0 ? points.findIndex((p) => p.cents === max) : -1;

  return (
    <div>
      <div className="relative h-48 pl-16">
        {/* Eixo e linhas de grade: discretos (hairline), 0 · metade · topo */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute left-16 right-0 border-t border-neutral-200" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-16 w-14 -translate-y-1/2 text-right text-[11px] tabular-nums text-neutral-500">{compactBRL(top * f)}</span>
          </div>
        ))}

        <div className="relative flex h-full items-end gap-[2px]" onPointerLeave={() => setActive(null)}>
          {points.map((p, i) => {
            const h = (p.cents / top) * 100;
            return (
              <button
                key={p.date}
                type="button"
                aria-label={`${weekday(p.date)} ${shortDate(p.date)}: ${formatBRL(p.cents)}, ${ordersLabel(p.orders)}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                {p.cents > 0 && (
                  <span
                    className={`block w-full max-w-6 rounded-t-[4px] bg-primary-500 transition ${active === i ? "opacity-75" : ""} group-focus-visible:ring-2 group-focus-visible:ring-primary-300`}
                    style={{ height: `${Math.max(h, 1.5)}%` }}
                  />
                )}
                {/* Rótulo direto só no melhor dia (os outros ficam na dica e na tabela) */}
                {i === best && active === null && (
                  <span className="pointer-events-none absolute whitespace-nowrap text-[11px] font-medium text-neutral-700" style={{ bottom: `calc(${h}% + 4px)` }}>
                    {formatBRL(p.cents)}
                  </span>
                )}
              </button>
            );
          })}

          {active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg"
              // Logo acima da coluna (dentro da área do gráfico), sem sair pelas laterais.
              style={{
                left: `clamp(60px, ${((active + 0.5) / points.length) * 100}%, calc(100% - 60px))`,
                bottom: `min(calc(${(points[active].cents / top) * 100}% + 8px), calc(100% - 52px))`,
              }}
            >
              <p className="text-sm font-semibold">{formatBRL(points[active].cents)}</p>
              <p className="text-neutral-300">
                {weekday(points[active].date)}, {shortDate(points[active].date)} · {ordersLabel(points[active].orders)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Datas: uma a cada 7 dias e o último dia */}
      <div className="mt-1.5 flex gap-[2px] pl-16">
        {points.map((p, i) => (
          <div key={p.date} className="relative flex-1">
            {((i % 7 === 0 && i < points.length - 4) || i === points.length - 1) && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-neutral-500">
                {i === points.length - 1 ? "hoje" : shortDate(p.date)}
              </span>
            )}
          </div>
        ))}
      </div>

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
