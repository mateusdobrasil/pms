"use client";

import { useState } from "react";
import { REVIEW_COMMENT_MAX } from "@/lib/reviews";

const LABELS = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];

// Estrelas (já marcadas se o cliente tocou numa estrela do e-mail) e comentário opcional.
export function ReviewForm({ token, initial }: { token: string; initial: number | null }) {
  const [rating, setRating] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const shown = hover || rating;

  async function send() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, rating, comment }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) return setState("done");
    setError(data?.error ?? "Não foi possível enviar agora. Tente de novo.");
    setState("idle");
  }

  if (state === "done") {
    return (
      <div className="space-y-2 rounded-xl bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-2xl">💚</p>
        <p className="font-semibold">Obrigado pela avaliação!</p>
        <p className="text-sm">Ela já aparece na loja e ajuda outros clientes a escolher.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className={`text-4xl transition ${n <= shown ? "text-amber-400" : "text-neutral-300"}`}
            >
              ★
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm text-neutral-600">{LABELS[shown]}</p>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={REVIEW_COMMENT_MAX}
        rows={4}
        placeholder="Conte como foi (opcional)"
        className="w-full rounded-lg border px-3 py-2.5 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={!rating || state === "sending"}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {state === "sending" ? "Enviando…" : "Enviar avaliação"}
      </button>
      <p className="text-center text-xs text-neutral-500">Aparece na loja com o seu primeiro nome e a inicial do sobrenome.</p>
    </div>
  );
}
