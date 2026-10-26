"use client";

import { useActionState } from "react";
import { formatBRL } from "@/lib/money";
import { LINK_VALIDITY_DAYS, validityLabel, whatsappShareText } from "@/lib/payment-links";
import { createPaymentLink, type LinkFormState } from "./actions";
import { LinkShare } from "./link-share";
import { submitKeepingValues } from "@/lib/form-submit";

const input = "w-full rounded-md border px-3 py-2 text-sm";

export function LinkForm({ baseUrl, storeName }: { baseUrl: string; storeName: string }) {
  const [state, action, pending] = useActionState<LinkFormState, FormData>(createPaymentLink, null);
  const created = state?.created;
  const url = created ? `${baseUrl}/pagar/${created.token}` : "";

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">Novo link</h2>
      {/* Erro de validação mantém o que foi digitado; key limpa o formulário depois de criar um link. */}
      <form key={created?.token ?? "novo"} onSubmit={submitKeepingValues(action)} className="mt-3 grid gap-3 sm:grid-cols-6">
        <label className="block space-y-1 text-sm sm:col-span-4">
          <span className="font-medium text-neutral-700">O que está cobrando</span>
          <input name="title" required maxLength={120} placeholder='Ex.: "Vestido azul M" ou "Sinal do casamento"' className={input} />
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Valor (R$)</span>
          <input name="amount" required inputMode="decimal" placeholder="150,00" className={input} />
        </label>
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-700">Validade</span>
          <select name="validity" defaultValue="7" className={input}>
            {LINK_VALIDITY_DAYS.map((d) => (
              <option key={d} value={d}>{validityLabel(d)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-4 sm:pt-6">
          <input type="checkbox" name="reusable" className="mt-0.5" />
          <span>
            <span className="font-medium text-neutral-700">Pode ser pago várias vezes</span>
            <span className="block text-xs text-neutral-500">Para um link fixo (na bio do Instagram, por exemplo). Sem marcar, o link fecha no primeiro pagamento.</span>
          </span>
        </label>
        <div className="sm:col-span-6">
          <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "Criando…" : "Criar link"}
          </button>
        </div>
      </form>
      {state?.error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {created && (
        <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">
            Link criado: {created.title} · {formatBRL(created.amountCents)}
          </p>
          <code className="block break-all rounded bg-white px-2 py-1.5 font-mono text-xs">{url}</code>
          <LinkShare url={url} whatsappText={whatsappShareText(storeName, created.title, formatBRL(created.amountCents), url)} />
        </div>
      )}
    </section>
  );
}
