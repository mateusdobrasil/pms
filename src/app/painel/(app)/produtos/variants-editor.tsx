"use client";

import { useState, useTransition } from "react";
import { saveVariants, type VariantInput, type VariantRow, type VariantsState } from "./actions";

type Draft = VariantInput & { key: string };

function toDraft(v: VariantRow): Draft {
  return { ...v, key: v.id, sku: v.sku ?? "", stockOriginal: v.stock };
}

const cell = "w-full min-w-0 rounded border px-2 py-1";

export function VariantsEditor({ productId, variants }: { productId: string; variants: VariantRow[] }) {
  const [rows, setRows] = useState<Draft[]>(() => variants.map(toDraft));
  const [state, setState] = useState<VariantsState>(null);
  const [pending, startTransition] = useTransition();
  const [showSizes, setShowSizes] = useState(false);

  const update = (key: string, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    const base = rows[rows.length - 1];
    setRows((rs) => [
      ...rs,
      {
        key: crypto.randomUUID(),
        id: null,
        name: "",
        sku: "",
        price: base?.price ?? "",
        compareAt: base?.compareAt ?? "",
        stock: 0,
        stockOriginal: null,
        weightG: base?.weightG ?? 300,
        heightCm: base?.heightCm ?? 5,
        widthCm: base?.widthCm ?? 15,
        lengthCm: base?.lengthCm ?? 20,
        active: true,
      },
    ]);
  }

  function save() {
    setState(null);
    startTransition(async () => {
      const result = await saveVariants(productId, rows); // "key" é só da tela e o servidor ignora
      setState(result);
      // O servidor devolve as variações gravadas (ids novos e estoque atual).
      if (result?.variants) setRows(result.variants.map(toDraft));
    });
  }

  return (
    <section className="space-y-3 rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Variações e estoque</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={showSizes} onChange={(e) => setShowSizes(e.target.checked)} />
          Mostrar peso e medidas (frete)
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Nome</th>
              <th className="py-1 pr-2 font-medium">SKU</th>
              <th className="py-1 pr-2 font-medium">Preço</th>
              <th className="py-1 pr-2 font-medium">Preço “de”</th>
              <th className="py-1 pr-2 font-medium">Estoque</th>
              {showSizes && (
                <>
                  <th className="py-1 pr-2 font-medium">Peso (g)</th>
                  <th className="py-1 pr-2 font-medium">Alt. (cm)</th>
                  <th className="py-1 pr-2 font-medium">Larg. (cm)</th>
                  <th className="py-1 pr-2 font-medium">Comp. (cm)</th>
                </>
              )}
              <th className="py-1 pr-2 font-medium">Ativa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1 pr-2"><input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="M / Azul" className={cell} /></td>
                <td className="py-1 pr-2"><input value={r.sku} onChange={(e) => update(r.key, { sku: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-2"><input value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} inputMode="decimal" placeholder="79,90" className={cell} /></td>
                <td className="py-1 pr-2"><input value={r.compareAt} onChange={(e) => update(r.key, { compareAt: e.target.value })} inputMode="decimal" placeholder="opcional" className={cell} /></td>
                <td className="py-1 pr-2"><input type="number" min={0} step={1} value={r.stock} onChange={(e) => update(r.key, { stock: e.target.valueAsNumber })} className={cell} /></td>
                {showSizes && (
                  <>
                    <td className="py-1 pr-2"><input type="number" min={1} step={1} value={r.weightG} onChange={(e) => update(r.key, { weightG: e.target.valueAsNumber })} className={cell} /></td>
                    <td className="py-1 pr-2"><input type="number" min={0.1} step={0.1} value={r.heightCm} onChange={(e) => update(r.key, { heightCm: e.target.valueAsNumber })} className={cell} /></td>
                    <td className="py-1 pr-2"><input type="number" min={0.1} step={0.1} value={r.widthCm} onChange={(e) => update(r.key, { widthCm: e.target.valueAsNumber })} className={cell} /></td>
                    <td className="py-1 pr-2"><input type="number" min={0.1} step={0.1} value={r.lengthCm} onChange={(e) => update(r.key, { lengthCm: e.target.valueAsNumber })} className={cell} /></td>
                  </>
                )}
                <td className="py-1 pr-2 text-center"><input type="checkbox" checked={r.active} onChange={(e) => update(r.key, { active: e.target.checked })} /></td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    disabled={rows.length === 1}
                    className="text-red-700 disabled:opacity-30"
                    aria-label="Remover variação"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Com uma única variação, use o nome “Único”: a loja mostra só o nome do produto. Para algo que já vendeu, prefira
        desmarcar “Ativa” em vez de remover.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="rounded-md border px-3 py-2 text-sm">+ Variação</button>
        <button type="button" onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar variações"}
        </button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      </div>
    </section>
  );
}
