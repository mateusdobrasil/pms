"use client";

import { useState } from "react";

// Copia o link de acompanhamento do pedido (o endereço desta página).
export function CopyOrderLink() {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("manual");
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:border-neutral-400"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth={2}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
        </svg>
        {state === "copied" ? "Link copiado!" : "Copiar link"}
      </button>
      {state === "manual" && (
        <input
          readOnly
          value={typeof window !== "undefined" ? window.location.href : ""}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label="Link do pedido"
          className="block w-full rounded-lg border px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
