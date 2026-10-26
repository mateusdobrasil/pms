"use client";

import { useState, useTransition } from "react";
import { formatBRL, parseBRL } from "@/lib/money";
import { COUNTER_PAYMENTS, type CounterPayment, changeFor, counterTotal } from "@/lib/counter";
import { receiveBookingAction } from "./actions";

// "Receber R$ 70,00": o que falta do agendamento (valor menos o pago online), pago no salão. Marca como atendido.
export function ReceiveBooking({ bookingId, dueCents }: { bookingId: string; dueCents: number }) {
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState<CounterPayment | null>(null);
  const [discount, setDiscount] = useState("");
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const discountCents = parseBRL(discount || "0") ?? 0;
  const { totalCents } = counterTotal(dueCents, discountCents);
  const change = payment === "cash" && received ? changeFor(totalCents, parseBRL(received) ?? 0) : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700">
        Receber {formatBRL(dueCents)}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border bg-neutral-50 p-2 text-xs">
      <div className="grid grid-cols-2 gap-1">
        {(["cash", "pix", "credit", "debit"] as CounterPayment[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setPayment(m)}
            className={`rounded border px-1.5 py-1 font-medium ${payment === m ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:border-neutral-400"}`}
          >
            {COUNTER_PAYMENTS[m]}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2">
        <span>Desconto (R$)</span>
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-20 rounded border px-1.5 py-1 text-right" />
      </label>
      {payment === "cash" && (
        <label className="flex items-center justify-between gap-2">
          <span>Recebido (R$)</span>
          <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-20 rounded border px-1.5 py-1 text-right" />
        </label>
      )}
      {payment === "cash" && received && (
        <p className={`text-right font-semibold ${change == null ? "text-red-700" : "text-emerald-700"}`}>{change == null ? "Valor menor que o total" : `Troco: ${formatBRL(change)}`}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !payment || (payment === "cash" && !!received && change == null)}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await receiveBookingAction(bookingId, payment, Math.min(discountCents, dueCents));
              if (!r.ok) setError(r.error);
            })
          }
          className="flex-1 rounded-md bg-emerald-600 px-2 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Recebendo…" : `Confirmar ${formatBRL(totalCents)}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-1 text-neutral-500 hover:underline">Voltar</button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
