"use client";

import { useActionState, useState } from "react";
import { WA_EVENTS, WA_FIELDS, WA_SUGGESTIONS, type WaEvent, type WaField, countPlaceholders, previewText } from "@/lib/whatsapp-events";
import { saveEventTemplate, type ModelState } from "./actions";

export type MetaTemplate = { name: string; language: string; status: string; category: string; body: string };
type Current = { template: string; language: string; params: WaField[]; enabled: boolean } | null;

const input = "rounded-md border bg-white px-3 py-2";

// Modelo de um evento: template da Meta (da lista da conta ou digitado), o dado de cada {{n}} e a prévia.
export function ModelForm({ event, templates, current }: { event: WaEvent; templates: MetaTemplate[] | null; current: Current }) {
  const [state, action, pending] = useActionState<ModelState, FormData>(saveEventTemplate, null);
  const suggestion = WA_SUGGESTIONS[event];
  const fields = WA_EVENTS[event].fields;
  const campaign = WA_EVENTS[event].audience === "optin";
  const [name, setName] = useState(current?.template ?? suggestion.name);
  const [language, setLanguage] = useState(current?.language ?? "pt_BR");
  const meta = templates?.find((t) => t.name === name && t.language === language) ?? null;
  const [manualCount, setManualCount] = useState(current?.params.length ?? suggestion.params.length);
  const count = meta ? countPlaceholders(meta.body) : manualCount;
  // Dado de cada variável: o salvo; senão, o da sugestão (quando o template é o sugerido).
  const [mapping, setMapping] = useState<WaField[]>(current?.params ?? suggestion.params);
  const at = (i: number): WaField | "" => mapping[i] ?? "";
  const body = meta?.body ?? (name === suggestion.name ? suggestion.body : "");

  function pick(key: string) {
    const [n, l] = key.split("|");
    setName(n);
    setLanguage(l);
    if (!current || current.template !== n) setMapping(n === suggestion.name ? suggestion.params : []);
  }

  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="count" value={count} />
      <div className="flex flex-wrap gap-2">
        {templates?.length ? (
          <select value={meta ? `${meta.name}|${meta.language}` : ""} onChange={(e) => pick(e.target.value)} className={`${input} min-w-64 flex-1`} aria-label="Template">
            <option value="" disabled>{name ? `${name} (não encontrado na conta)` : "Escolha o template…"}</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} · {t.language} · {t.status === "APPROVED" ? "aprovado" : t.status.toLowerCase()}{t.category === "MARKETING" ? " · marketing" : ""}
              </option>
            ))}
          </select>
        ) : null}
        <input name="template" value={name} onChange={(e) => setName(e.target.value.trim())} required placeholder="nome_do_template" className={`${input} min-w-48 flex-1 font-mono`} aria-label="Nome do template" />
        <input name="language" value={language} onChange={(e) => setLanguage(e.target.value.trim())} required className={`${input} w-24 font-mono`} aria-label="Idioma" />
        {!meta && (
          <label className="flex items-center gap-1 text-neutral-600">
            Variáveis
            <input type="number" min={0} max={20} value={manualCount} onChange={(e) => setManualCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={`${input} w-20`} />
          </label>
        )}
      </div>
      {meta && meta.status !== "APPROVED" && <p className="text-amber-700">Este template ainda não está aprovado na Meta ({meta.status}): o envio falha até aprovar.</p>}
      {campaign
        ? meta && meta.category !== "MARKETING" && <p className="text-amber-700">Campanha é propaganda: cadastre o template na categoria Marketing (a Meta recategoriza ou bloqueia propaganda em Utilidade).</p>
        : meta?.category === "MARKETING" && <p className="text-amber-700">Categoria marketing: custa mais e só pode ir para quem aceitou receber. Para avisos de pedido e agenda, use Utilidade.</p>}

      {count > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: count }, (_, i) => (
            <label key={i} className="flex items-center gap-2">
              <code className="w-12 shrink-0 text-xs text-neutral-500">{`{{${i + 1}}}`}</code>
              <select
                name={`p${i + 1}`}
                value={at(i)}
                required
                onChange={(e) => setMapping((m) => Object.assign([...m], { [i]: e.target.value as WaField }))}
                className={`${input} flex-1`}
              >
                <option value="" disabled>Escolha o dado…</option>
                {fields.map((f) => (
                  <option key={f} value={f}>{WA_FIELDS[f].label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {body ? (
        <p className="whitespace-pre-wrap rounded-md bg-emerald-50 px-3 py-2 text-emerald-950">
          <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Prévia</span>
          {previewText(body, mapping.slice(0, count))}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">Sem o texto do template aqui (precisa de WHATSAPP_BUSINESS_ACCOUNT_ID para ler da Meta): confira a ordem das variáveis no WhatsApp Manager.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" value="1" defaultChecked={current?.enabled ?? true} /> Ligado
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar modelo"}
        </button>
        {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
