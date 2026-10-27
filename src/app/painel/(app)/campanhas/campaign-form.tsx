"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { CAMPAIGN_TEXT_MAX, cleanCampaignText } from "@/lib/whatsapp-campaigns";
import { type WaField, previewText } from "@/lib/whatsapp-events";
import { sendCampaign, type CampaignFormState } from "./actions";

type Props = {
  storeName: string;
  baseUrl: string;
  paths: { path: string; label: string }[];
  coupons: string[];
  recipients: number; // quantos vão receber (aceites, até a cota)
  template: { body: string; params: WaField[] } | null; // para a prévia
};

export function CampaignForm({ storeName, baseUrl, paths, coupons, recipients, template }: Props) {
  const [state, action, pending] = useActionState<CampaignFormState, FormData>(sendCampaign, null);
  const [text, setText] = useState("");
  const [path, setPath] = useState("/");
  const [coupon, setCoupon] = useState("");
  const link = `${baseUrl}${path}${coupon ? `?cupom=${coupon}` : ""}`;
  const preview = template
    ? previewText(template.body, template.params, {
        first_name: "Ana",
        customer_name: "Ana Souza",
        store_name: storeName,
        campaign_text: cleanCampaignText(text) ?? "(sua mensagem)",
        link,
        coupon_code: coupon || "-",
        optout_link: `${baseUrl}/whatsapp/sair/…`,
      })
    : null;

  function confirmSend(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Enviar a campanha para ${recipients} ${recipients === 1 ? "cliente" : "clientes"} pelo WhatsApp?`)) {
      e.preventDefault();
      return;
    }
    submitKeepingValues(action)(e);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">Nova campanha</h2>
      <form key={state?.ok ?? "nova"} onSubmit={confirmSend} className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Mensagem</span>
          <textarea
            name="text"
            required
            rows={3}
            maxLength={CAMPAIGN_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Chegou a coleção de verão, com 20% de desconto até domingo!"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <span className="block text-xs text-neutral-500">{text.length}/{CAMPAIGN_TEXT_MAX} · uma frase ou duas, sem quebra de linha. O nome do cliente e da loja entram sozinhos.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Link da mensagem</span>
            <select name="path" value={path} onChange={(e) => setPath(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
              {paths.map((p) => (
                <option key={p.path} value={p.path}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Cupom (opcional)</span>
            <select name="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Sem cupom</option>
              {coupons.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="block text-xs text-neutral-500">Com cupom, o link já aplica o desconto no checkout.</span>
          </label>
        </div>
        {preview && (
          <p className="whitespace-pre-wrap rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Prévia (para a cliente Ana)</span>
            {preview}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || recipients === 0} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? "Criando…" : `Enviar para ${recipients} ${recipients === 1 ? "cliente" : "clientes"}`}
          </button>
        </div>
      </form>
      {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </section>
  );
}
