"use client";

import { useActionState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { saveStock } from "../../actions";

type Variant = { id: string; name: string; sku: string | null; stock: number; active: boolean };

export function StockForm({ productId, variants }: { productId: string; variants: Variant[] }) {
  const [state, action, pending] = useActionState(saveStock, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <ul className="divide-y text-sm">
        {variants.map((v) => (
          <li key={v.id} className={`flex items-center justify-between gap-3 py-2.5 ${v.active ? "" : "opacity-60"}`}>
            <label htmlFor={`stock_${v.id}`} className="min-w-0">
              <span className="font-medium">{v.name}</span>
              {v.sku && <span className="ml-2 text-xs text-neutral-500">{v.sku}</span>}
              {!v.active && <span className="ml-2 text-xs text-neutral-500">(fora da loja)</span>}
            </label>
            <input type="hidden" name={`orig_${v.id}`} value={v.stock} />
            <input
              id={`stock_${v.id}`}
              name={`stock_${v.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={v.stock}
              className="w-24 rounded-md border px-3 py-1.5 text-right tabular-nums"
            />
          </li>
        ))}
      </ul>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
        {pending ? "Salvando…" : "Salvar estoque"}
      </button>
    </form>
  );
}
