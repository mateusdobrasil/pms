"use client";

import { useActionState } from "react";
import { MAX_BIO_LINKS, type BioLink } from "@/lib/bio-links";
import { submitKeepingValues } from "@/lib/form-submit";
import { saveBio, type BioState } from "./actions";

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

// Frase e links extras da página de links (linhas vazias são ignoradas).
export function BioForm({ text, links }: { text: string; links: BioLink[] }) {
  const [state, action, pending] = useActionState<BioState, FormData>(saveBio, null);
  const rows = Array.from({ length: MAX_BIO_LINKS }, (_, i) => links[i] ?? { title: "", url: "" });
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Frase de apresentação (opcional)</span>
        <input name="bio_text" defaultValue={text} maxLength={160} placeholder="Ex.: Moda feminina com entrega em todo o Brasil" className={input} />
      </label>
      <div className="space-y-2 text-sm">
        <p className="font-medium">Links extras (opcional)</p>
        <p className="text-xs text-neutral-500">
          Os botões da loja (produtos, agendar, pacotes e WhatsApp) já aparecem sozinhos. Aqui entram outros, como o endereço no Google Maps, o iFood ou um
          catálogo.
        </p>
        {rows.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input name="link_title" defaultValue={l.title} maxLength={40} placeholder={i === 0 ? "Ex.: Como chegar" : "Nome do botão"} aria-label={`Nome do link ${i + 1}`} className={input} />
            <input name="link_url" defaultValue={l.url} placeholder={i === 0 ? "Ex.: https://maps.app.goo.gl/..." : "https://..."} aria-label={`Endereço do link ${i + 1}`} className={input} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
