"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { cancelBookingByStore, createManualBooking, setBookingStatus, type AgendaState } from "./actions";

// Atendido / Faltou / Cancelar, no cartão do agendamento.
export function BookingActions({ id, paidLabel, past }: { id: string; paidLabel: string | null; past: boolean }) {
  const [state, setStatus, pending] = useActionState<AgendaState, FormData>(setBookingStatus, null);
  const [cancelState, cancel, canceling] = useActionState<AgendaState, FormData>(cancelBookingByStore, null);
  const busy = pending || canceling;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 text-xs">
        <form action={setStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="completed" />
          <button disabled={busy} className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Atendido</button>
        </form>
        {past && (
          <form action={setStatus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="no_show" />
            <button disabled={busy} className="rounded-md border px-2.5 py-1 font-medium hover:bg-neutral-50 disabled:opacity-50">Faltou</button>
          </form>
        )}
        <form
          action={cancel}
          onSubmit={(e) => {
            if (!confirm(paidLabel ? `Cancelar o agendamento? Vamos devolver ${paidLabel} ao cliente pelo Mercado Pago.` : "Cancelar o agendamento? O cliente recebe um aviso.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button disabled={busy} className="rounded-md px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Cancelar</button>
        </form>
      </div>
      {(state?.error || cancelState?.error) && <p className="text-xs text-red-700">{state?.error ?? cancelState?.error}</p>}
    </div>
  );
}

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

// Encaixe manual (cliente do balcão ou do WhatsApp).
export function ManualBookingForm({
  services,
  professionals,
  date,
}: {
  services: { id: string; name: string; duration: string }[];
  professionals: { id: string; name: string }[];
  date: string;
}) {
  const [state, action, pending] = useActionState<AgendaState, FormData>(createManualBooking, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="service_id" required className={input} defaultValue="">
          <option value="" disabled>Serviço</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.duration})</option>
          ))}
        </select>
        <select name="professional_id" required className={input} defaultValue={professionals.length === 1 ? professionals[0].id : ""}>
          <option value="" disabled>Profissional</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input name="date" type="date" required defaultValue={date} className={input} />
        <input name="time" type="time" required step={300} className={input} />
        <input name="name" required placeholder="Nome do cliente" className={input} />
        <input name="phone" inputMode="tel" placeholder="Celular (opcional)" className={input} />
        <input name="email" type="email" placeholder="E-mail (opcional: recebe a confirmação)" className={input} />
        <input name="notes" maxLength={500} placeholder="Observação (opcional)" className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Agendando…" : "Agendar"}
        </button>
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-green-700">{state.ok}</span>}
      </div>
      <p className="text-xs text-neutral-500">O encaixe aceita qualquer horário, mesmo fora do expediente; só não deixa marcar em cima de outro agendamento do profissional. Pagamento no salão.</p>
    </form>
  );
}
