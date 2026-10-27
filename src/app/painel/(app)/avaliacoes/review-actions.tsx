"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { replyToReview, setReviewHidden, type ReplyState } from "./actions";

const HIDE_REASONS = ["Palavrão ou ofensa", "Dados pessoais (telefone, endereço...)", "Propaganda ou spam", "Não é sobre a loja"];

// Responder (público) e ocultar (só ofensiva, com motivo) uma avaliação.
export function ReviewActions({ id, reply, hidden }: { id: string; reply: string | null; hidden: boolean }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyToReview, null);
  const [editing, setEditing] = useState(false);
  const [hiding, setHiding] = useState(false);

  return (
    <div className="space-y-2 text-sm">
      {editing ? (
        <form onSubmit={submitKeepingValues(action)} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <textarea name="reply" defaultValue={reply ?? ""} maxLength={1000} rows={3} placeholder="Escreva a sua resposta (aparece na loja, abaixo da avaliação)" className="w-full rounded-md border px-3 py-2" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
              {pending ? "Salvando…" : "Publicar resposta"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md border px-3 py-1.5">Fechar</button>
            {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
            {state?.error && <span className="text-red-700">{state.error}</span>}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="rounded-md border px-3 py-1.5 font-medium hover:border-neutral-400">
            {reply ? "Editar resposta" : "Responder"}
          </button>
          {hidden ? (
            <form action={setReviewHidden}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="hide" value="0" />
              <button type="submit" className="rounded-md border px-3 py-1.5 font-medium hover:border-neutral-400">Mostrar de novo</button>
            </form>
          ) : (
            <button type="button" onClick={() => setHiding((v) => !v)} className="rounded-md border px-3 py-1.5 text-neutral-600 hover:border-neutral-400">Ocultar…</button>
          )}
        </div>
      )}
      {hiding && !hidden && (
        <form action={setReviewHidden} className="space-y-2 rounded-md bg-amber-50 p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="hide" value="1" />
          <p className="text-amber-900">
            Ocultar é só para avaliação ofensiva. Crítica sobre o produto ou o atendimento deve ficar na loja: responda com educação, isso passa mais
            confiança do que esconder.
          </p>
          <select name="reason" required defaultValue="" className="w-full rounded-md border bg-white px-3 py-2">
            <option value="" disabled>Motivo…</option>
            {HIDE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">Ocultar da loja</button>
        </form>
      )}
    </div>
  );
}
