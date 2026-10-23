"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { createTimeOff, type TimeOffState } from "./actions";

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

export function TimeOffForm({ professionals, today }: { professionals: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState<TimeOffState, FormData>(createTimeOff, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Quem</span>
          <select name="professional_id" className={input}>
            <option value="">Salão todo (fechado)</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Motivo (opcional, só você vê)</span>
          <input name="reason" maxLength={100} placeholder="Ex.: feriado, férias, curso" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">De</span>
          <div className="flex gap-2">
            <input name="start_date" type="date" required min={today} defaultValue={today} className={input} />
            <input name="start_time" type="time" className="w-28 rounded-md border bg-white px-2 py-2" aria-label="Hora de início (opcional)" />
          </div>
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Até</span>
          <div className="flex gap-2">
            <input name="end_date" type="date" min={today} className={input} />
            <input name="end_time" type="time" className="w-28 rounded-md border bg-white px-2 py-2" aria-label="Hora de fim (opcional)" />
          </div>
        </label>
      </div>
      <p className="text-xs text-neutral-500">Sem horário, bloqueia os dias inteiros. Sem a data final, vale só para o dia de início.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Salvando…" : "Bloquear"}
        </button>
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-green-700">{state.ok}</span>}
      </div>
    </form>
  );
}
