"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";
import { axisTop, compactBRL } from "@/lib/sales";

// Colunas de valores em reais (uma série: cor da marca, sem legenda; o título do cartão diz o que é).
// Usado no Resumo do lojista (vendas por dia) e no Financeiro do admin (recebido por mês).
export type Column = {
  key: string;
  cents: number;
  axisLabel?: string; // texto sob a coluna (só em algumas, para não encavalar)
  title: string; // dica: linha de baixo, ex.: "ter, 20/10"
  detail?: string; // dica: complemento, ex.: "4 pedidos"
};

export function ColumnChart({ columns }: { columns: Column[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...columns.map((c) => c.cents));
  const top = axisTop(max * 1.1); // folga no topo: o rótulo do maior valor não encosta no eixo
  const best = max > 0 ? columns.findIndex((c) => c.cents === max) : -1;
  const shown = active === null ? null : columns[active];

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
          {columns.map((c, i) => {
            const h = (c.cents / top) * 100;
            return (
              <button
                key={c.key}
                type="button"
                aria-label={`${c.title}: ${formatBRL(c.cents)}${c.detail ? `, ${c.detail}` : ""}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                {c.cents > 0 && (
                  <span
                    className={`block w-full max-w-6 rounded-t-[4px] bg-primary-500 transition ${active === i ? "opacity-75" : ""} group-focus-visible:ring-2 group-focus-visible:ring-primary-300`}
                    style={{ height: `${Math.max(h, 1.5)}%` }}
                  />
                )}
                {/* Rótulo direto só no maior valor (os outros ficam na dica e na tabela) */}
                {i === best && active === null && (
                  <span className="pointer-events-none absolute whitespace-nowrap text-[11px] font-medium text-neutral-700" style={{ bottom: `calc(${h}% + 4px)` }}>
                    {formatBRL(c.cents)}
                  </span>
                )}
              </button>
            );
          })}

          {shown && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg"
              // Logo acima da coluna (dentro da área do gráfico), sem sair pelas laterais.
              style={{
                left: `clamp(60px, ${((active! + 0.5) / columns.length) * 100}%, calc(100% - 60px))`,
                bottom: `min(calc(${(shown.cents / top) * 100}% + 8px), calc(100% - 52px))`,
              }}
            >
              <p className="text-sm font-semibold">{formatBRL(shown.cents)}</p>
              <p className="text-neutral-300">
                {shown.title}
                {shown.detail && ` · ${shown.detail}`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px] pl-16">
        {columns.map((c) => (
          <div key={c.key} className="relative flex-1">
            {c.axisLabel && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-neutral-500">{c.axisLabel}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
