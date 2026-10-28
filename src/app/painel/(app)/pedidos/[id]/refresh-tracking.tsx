"use client";

import { useState, useTransition } from "react";
import { refreshTracking } from "./actions";

// Consulta os Correios agora (além da rotina de 3 em 3 horas).
export function RefreshTracking({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      {msg?.error && <span className="text-red-700">{msg.error}</span>}
      {msg?.ok && <span className="text-emerald-700">{msg.ok}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMsg(await refreshTracking(orderId)))}
        className="rounded-md border px-2.5 py-1 font-medium hover:border-neutral-400 disabled:opacity-50"
      >
        {pending ? "Consultando…" : "Atualizar rastreio"}
      </button>
    </span>
  );
}
