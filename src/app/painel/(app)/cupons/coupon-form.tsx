"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { COUPON_SCOPES } from "@/lib/coupons";
import { createCoupon, type CouponState } from "./actions";

const input = "w-full rounded-md border px-3 py-2 text-sm";

export function CouponForm({ withScope }: { withScope: boolean }) {
  const [state, action, pending] = useActionState<CouponState, FormData>(createCoupon, null);
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">Novo cupom</h2>
      {/* key limpa o formulário depois de criar; erro de validação mantém o que foi digitado. */}
      <form key={state?.ok ?? "novo"} onSubmit={submitKeepingValues(action)} className="mt-3 grid gap-3 sm:grid-cols-6">
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Código</span>
          <input name="code" required maxLength={30} placeholder="BEMVINDO10" className={`${input} font-mono uppercase`} />
        </label>
        <fieldset className="space-y-1 text-sm sm:col-span-2">
          <legend className="font-medium text-neutral-700">Desconto</legend>
          <div className="flex gap-2">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")} className="rounded-md border px-2 py-2 text-sm" aria-label="Tipo de desconto">
              <option value="percent">%</option>
              <option value="fixed">R$</option>
            </select>
            <input name="value" required inputMode="decimal" placeholder={kind === "percent" ? "10" : "20,00"} aria-label="Valor do desconto" className={input} />
          </div>
        </fieldset>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Compra mínima (opcional)</span>
          <input name="min" inputMode="decimal" placeholder="100,00" className={input} />
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Vale a partir de (opcional)</span>
          <input name="starts" type="date" className={input} />
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Vale até (opcional)</span>
          <input name="ends" type="date" className={input} />
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Limite de usos (opcional)</span>
          <input name="max_uses" inputMode="numeric" placeholder="Ex.: 50" className={input} />
        </label>
        {withScope && (
          <label className="block space-y-1 text-sm sm:col-span-6">
            <span className="font-medium text-neutral-700">Onde vale</span>
            <select name="scope" defaultValue="all" className={input}>
              {Object.entries(COUPON_SCOPES).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-start gap-2 text-sm sm:col-span-6">
          <input type="checkbox" name="once" className="mt-0.5" />
          <span>
            <span className="font-medium text-neutral-700">Uma vez por cliente</span>
            <span className="block text-xs text-neutral-500">Cada cliente (CPF ou celular) usa o cupom uma vez só (bom para cupom de primeira compra).</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "Criando…" : "Criar cupom"}
          </button>
          {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
          {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
        </div>
      </form>
    </section>
  );
}
