"use client";

import { useState } from "react";

export function OptOutButton({ token, storeName }: { token: string; storeName: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function leave() {
    setState("sending");
    const res = await fetch("/api/whatsapp/sair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }

  if (state === "done") return <p className="font-medium text-emerald-700">Pronto: você não recebe mais novidades da {storeName} pelo WhatsApp.</p>;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={leave}
        disabled={state === "sending"}
        className="rounded-lg px-5 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {state === "sending" ? "Saindo…" : "Não quero mais receber"}
      </button>
      {state === "error" && <p className="text-sm text-red-700">Não foi possível agora. Tente de novo.</p>}
    </div>
  );
}
