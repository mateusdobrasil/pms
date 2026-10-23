"use client";

import { useState } from "react";

// "Avise-me quando chegar" na opção esgotada: guarda o e-mail e o servidor avisa na reposição.
// title: "Produto esgotado no momento." / "Opção M esgotada no momento."; subject: "o produto" / "a opção M".
export function NotifyMe({ variantId, title, subject }: { variantId: string; title: string; subject: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "sending" });
    const res = await fetch("/api/stock-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, email }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res?.ok && data?.ok) setState({ status: "done" });
    else setState({ status: "error", message: data?.error ?? "Não foi possível salvar agora. Tente de novo." });
  }

  if (state.status === "done") {
    return (
      <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Pronto! Avisaremos em <strong>{email}</strong> assim que {subject} voltar ao estoque.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg bg-neutral-100 px-4 py-3">
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="notify-email">Seu e-mail</label>
        <input
          id="notify-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Seu e-mail"
          className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={state.status === "sending"}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {state.status === "sending" ? "Salvando…" : "Avise-me quando chegar"}
        </button>
      </div>
      {state.status === "error" && <p className="text-sm text-red-700">{state.message}</p>}
      <p className="text-xs text-neutral-500">Usamos seu e-mail só para este aviso, uma única vez.</p>
    </form>
  );
}
