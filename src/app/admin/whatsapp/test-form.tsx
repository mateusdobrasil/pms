"use client";

import { useActionState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { WA_EVENTS, type WaEvent } from "@/lib/whatsapp-events";
import { sendWhatsappTest, type TestState } from "./actions";

export function WhatsappTestForm({ disabled, events }: { disabled: boolean; events: WaEvent[] }) {
  const [state, action, pending] = useActionState<TestState, FormData>(sendWhatsappTest, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <select name="event" required defaultValue={events[0] ?? ""} className="min-w-56 rounded-md border bg-white px-3 py-2" aria-label="Evento">
          {events.length === 0 && <option value="">Nenhum evento com modelo</option>}
          {events.map((e) => (
            <option key={e} value={e}>{WA_EVENTS[e].label}</option>
          ))}
        </select>
        <input name="phone" type="tel" inputMode="tel" required placeholder="Celular com DDD" className="min-w-48 flex-1 rounded-md border bg-white px-3 py-2" />
        <button type="submit" disabled={pending || disabled || events.length === 0} className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? "Enviando…" : "Enviar teste"}
        </button>
      </div>
      {state?.ok && <p className="text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-red-700">{state.error}</p>}
    </form>
  );
}
