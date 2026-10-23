"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// "Precisa mudar?": remarcar (escolhe outro horário em /agendar) ou cancelar, até o prazo da loja.
export function ManageBooking({ token, paidLabel, deadline }: { token: string; paidLabel: string | null; deadline: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    const msg = paidLabel ? `Cancelar o agendamento? Devolvemos ${paidLabel} pelo Mercado Pago.` : "Cancelar o agendamento?";
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${token}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError(data?.error ?? "Não foi possível cancelar agora. Tente de novo.");
  }

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Precisa mudar?</h2>
      <p className="text-sm text-neutral-600">Você pode remarcar ou cancelar por aqui até {deadline}.</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/agendar?remarcar=${token}`}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          style={{ background: "var(--brand)" }}
        >
          Remarcar
        </Link>
        <button type="button" onClick={cancel} disabled={busy} className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
          {busy ? "Cancelando…" : "Cancelar agendamento"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
