"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { centsToInput } from "@/lib/money";
import { BIRTHDAY_VALID_DAYS, type BirthdayConfig } from "@/lib/birthday";
import { COUPON_SCOPES } from "@/lib/coupons";
import { saveBirthdayCoupon, type CouponState } from "./actions";

const input = "w-full rounded-md border px-3 py-2 text-sm";

// Configuração do cupom de aniversário (o cupom de cada cliente é criado sozinho, no dia).
export function BirthdayForm({ config }: { config: BirthdayConfig }) {
  const [state, action, pending] = useActionState<CouponState, FormData>(saveBirthdayCoupon, null);
  const [kind, setKind] = useState(config.kind);
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3 text-sm sm:grid-cols-6">
      <label className="flex items-start gap-2 sm:col-span-6">
        <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="mt-0.5" />
        <span>
          <span className="font-medium text-neutral-700">Dar um cupom de presente no aniversário do cliente</span>
          <span className="block text-xs text-neutral-500">
            Ligado, o checkout e o agendamento pedem o aniversário (dia e mês, opcional). No dia, a partir das 9h, o cliente recebe um cupom só dele, de uso
            único, por e-mail e, se aceitou novidades, pelo WhatsApp.
          </span>
        </span>
      </label>
      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="font-medium text-neutral-700">Presente</legend>
        <div className="flex gap-2">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")} className="rounded-md border px-2 py-2 text-sm" aria-label="Tipo de desconto">
            <option value="percent">%</option>
            <option value="fixed">R$</option>
          </select>
          <input
            key={kind}
            name="value"
            required
            inputMode="decimal"
            defaultValue={kind === config.kind ? (kind === "percent" ? String(config.value) : centsToInput(config.value)) : ""}
            placeholder={kind === "percent" ? "15" : "20,00"}
            aria-label="Valor do desconto"
            className={input}
          />
        </div>
      </fieldset>
      <label className="block space-y-1 sm:col-span-2">
        <span className="font-medium text-neutral-700">Vale por</span>
        <select name="valid_days" defaultValue={String(config.validDays)} className={input}>
          {BIRTHDAY_VALID_DAYS.map((d) => (
            <option key={d} value={d}>{d} dias</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className="font-medium text-neutral-700">Onde vale</span>
        <select name="scope" defaultValue={config.appliesTo} className={input}>
          {Object.entries(COUPON_SCOPES).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
