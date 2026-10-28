"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { SetupStep } from "@/lib/setup";

// "Esconder" fica no navegador (por loja). Lido com useSyncExternalStore: no servidor o cartão aparece.
const key = (storeId: string) => `setup-escondido-${storeId}`;
const read = (storeId: string) => {
  try {
    return localStorage.getItem(key(storeId)) === "1";
  } catch {
    return false;
  }
};
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Primeiros passos da loja no Resumo: some sozinho quando o essencial fica pronto.
export function SetupCard({ storeId, steps, done, total }: { storeId: string; steps: SetupStep[]; done: number; total: number }) {
  const hidden = useSyncExternalStore(subscribe, () => read(storeId), () => false);
  if (hidden) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <section className="space-y-4 rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Deixe sua loja pronta para vender</h2>
          <p className="text-sm text-neutral-600">{done} de {total} passos feitos. Cada passo se marca sozinho quando fica pronto.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(key(storeId), "1");
            } catch {
              // storage bloqueado: o cartão continua aparecendo
            }
            listeners.forEach((fn) => fn());
          }}
          className="text-xs text-neutral-500 hover:underline"
        >
          Esconder
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="divide-y text-sm">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 py-2.5">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"}`}
              aria-label={s.done ? "feito" : "pendente"}
            >
              {s.done ? "✓" : ""}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`font-medium ${s.done ? "text-neutral-500 line-through decoration-neutral-300" : ""}`}>{s.label}</span>
              {!s.required && <span className="ml-1 text-xs text-neutral-400">(opcional)</span>}
              {!s.done && <span className="block text-xs text-neutral-500">{s.hint}</span>}
            </span>
            {!s.done && s.href && (
              <Link href={s.href} className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium hover:border-neutral-400">
                Fazer
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
