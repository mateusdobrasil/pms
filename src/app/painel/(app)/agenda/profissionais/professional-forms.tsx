"use client";

import { useActionState, useRef } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { WEEKDAYS } from "@/lib/booking";
import { createProfessional, saveProfessional, type ProfessionalState } from "./actions";

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

export function CreateProfessionalForm() {
  const [state, action, pending] = useActionState<ProfessionalState, FormData>(createProfessional, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-2">
      <div className="flex gap-2">
        <input name="name" required placeholder="Nome do profissional" className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          Adicionar
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

export function ProfessionalForm({
  professional,
  services,
  hours,
}: {
  professional: { id: string; name: string; active: boolean; serviceIds: string[] };
  services: { id: string; name: string; active: boolean }[];
  hours: string[]; // 7 textos, domingo a sábado: "09:00-12:00, 13:00-18:00"
}) {
  const [state, action, pending] = useActionState<ProfessionalState, FormData>(saveProfessional, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Copia o horário de segunda para os outros dias úteis (atalho comum).
  function copyMonday() {
    const form = formRef.current;
    if (!form) return;
    const monday = (form.elements.namedItem("hours_1") as HTMLInputElement).value;
    for (const d of [2, 3, 4, 5]) (form.elements.namedItem(`hours_${d}`) as HTMLInputElement).value = monday;
  }

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-6 text-sm">
      <input type="hidden" name="id" value={professional.id} />
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <label className="block space-y-1">
          <span className="font-medium text-neutral-700">Nome</span>
          <input name="name" required defaultValue={professional.name} className={input} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={professional.active} /> Atendendo (aparece para agendar)
        </label>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-medium">Serviços que faz</h2>
        {services.length === 0 ? (
          <p className="text-neutral-500">Cadastre os serviços primeiro, em Agenda → Serviços.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" name="services" value={s.id} defaultChecked={professional.serviceIds.includes(s.id)} />
                {s.name}
                {!s.active && <span className="text-xs text-neutral-400">(indisponível)</span>}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Horários de trabalho</h2>
          <button type="button" onClick={copyMonday} className="text-xs font-medium text-primary-700 underline">
            Copiar segunda para terça a sexta
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Uma ou mais faixas por dia, separadas por vírgula: <code>09:00-12:00, 13:00-18:00</code> (o intervalo fica livre). Em branco = folga.
        </p>
        <div className="space-y-2">
          {WEEKDAYS.map((day, i) => (
            <label key={day} className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
              <span className="font-medium text-neutral-700">{day}</span>
              <input name={`hours_${i}`} defaultValue={hours[i]} placeholder="folga" className={input} />
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-5 py-2.5 font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar profissional"}
        </button>
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-green-700">{state.ok}</span>}
      </div>
    </form>
  );
}
