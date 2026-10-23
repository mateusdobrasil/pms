"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { centsToInput } from "@/lib/money";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/booking";
import { createService, updateService, type ServiceState } from "./actions";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  payment_mode: PaymentMode;
  deposit_percent: number | null;
  active: boolean;
};

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";
const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`);

// Cadastro e edição de serviço (o mesmo formulário).
export function ServiceForm({ service }: { service?: ServiceRow }) {
  const [state, action, pending] = useActionState<ServiceState, FormData>(service ? updateService : createService, null);
  const [mode, setMode] = useState<PaymentMode>(service?.payment_mode ?? "onsite");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !service) formRef.current?.reset();
  }, [state, service]);
  const durations = service && !DURATIONS.includes(service.duration_minutes) ? [...DURATIONS, service.duration_minutes].sort((a, b) => a - b) : DURATIONS;

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} onReset={() => setMode(service?.payment_mode ?? "onsite")} className="space-y-3 text-sm">
      {service && <input type="hidden" name="id" value={service.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Serviço</span>
          <input name="name" required defaultValue={service?.name} placeholder="Ex.: Corte feminino" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Duração</span>
          <select name="duration_minutes" defaultValue={service?.duration_minutes ?? 60} className={input}>
            {durations.map((d) => (
              <option key={d} value={d}>{durationLabel(d)}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Preço (R$)</span>
          <input name="price" inputMode="decimal" defaultValue={service ? centsToInput(service.price_cents) : ""} placeholder="80,00" className={input} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-medium text-neutral-700">Descrição (opcional)</span>
        <textarea name="description" rows={2} maxLength={500} defaultValue={service?.description ?? ""} className={input} />
      </label>
      <fieldset className="space-y-2">
        <legend className="font-medium text-neutral-700">Pagamento</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PAYMENT_MODES.map((m) => (
            <label key={m.value} className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${mode === m.value ? "border-primary-500 bg-primary-50" : ""}`}>
              <input type="radio" name="payment_mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5" />
              <span>
                <span className="block font-medium">{m.label}</span>
                <span className="block text-xs text-neutral-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "deposit" && (
          <label className="flex items-center gap-2">
            <span>Sinal de</span>
            <input name="deposit_percent" type="number" min={1} max={99} required defaultValue={service?.deposit_percent ?? 30} className="w-20 rounded-md border px-2 py-1.5" />
            <span>% do preço</span>
          </label>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Disponível para agendar
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Salvando…" : service ? "Salvar serviço" : "Adicionar serviço"}
        </button>
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-green-700">{state.ok}</span>}
      </div>
    </form>
  );
}
