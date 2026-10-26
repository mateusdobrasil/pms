"use client";

import { useState } from "react";

// Copiar o link e mandar no WhatsApp (o lojista escolhe o contato; a mensagem já vai escrita).
export function LinkShare({ url, whatsappText, compact = false }: { url: string; whatsappText: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const button = compact
    ? "rounded-md border px-2.5 py-1.5 text-xs font-medium transition hover:border-neutral-400"
    : "rounded-lg border px-4 py-2 text-sm font-medium transition hover:border-neutral-400";
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={button}>
        {copied ? "Copiado!" : "Copiar link"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${button} border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700`}
      >
        Enviar no WhatsApp
      </a>
    </div>
  );
}
