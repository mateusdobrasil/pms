"use client";

import { useActionState, useRef } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { WEEKDAYS } from "@/lib/booking";
import { createProfessional, saveProfessional, type ProfessionalState } from "./actions";

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";
const pct = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

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
  commission,
}: {
  professional: { id: string; name: string; active: boolean; serviceIds: string[] };
  services: { id: string; name: string; active: boolean }[];
  hours: string[]; // 7 textos, domingo a sábado: "09:00-12:00, 13:00-18:00"
  commission?: { general: number | null; perService: Record<string, number | null> }; // undefined = SQL da comissão não rodado
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

      {commission && (
        <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
          <input type="hidden" name="commission_enabled" value="1" />
          <h2 className="font-medium">Comissão</h2>
          <label className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-700">Comissão geral</span>
            <input name="commission" inputMode="decimal" defaultValue={pct(commission.general)} placeholder="ex.: 40" className="w-24 rounded-md border bg-white px-3 py-2 text-sm" />
            <span className="text-neutral-500">% do valor de cada serviço atendido</span>
          </label>
          {services.some((s) => professional.serviceIds.includes(s.id)) && (
            <details className="text-sm" open={Object.values(commission.perService).some((v) => v != null)}>
              <summary className="cursor-pointer text-neutral-600">Percentual diferente em algum serviço</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {services
                  .filter((s) => professional.serviceIds.includes(s.id))
                  .map((s) => (
                    <label key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <input name={`commission_${s.id}`} inputMode="decimal" defaultValue={pct(commission.perService[s.id] ?? null)} placeholder="geral" className="w-20 rounded-md border bg-white px-2 py-1 text-sm" />%
                      </span>
                    </label>
                  ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">Em branco, vale a comissão geral. Serviço marcado agora em &quot;Serviços que faz&quot; aparece aqui depois de salvar.</p>
            </details>
          )}
          <p className="text-xs text-neutral-500">
            A comissão de cada atendimento fica gravada quando você marca &quot;Atendido&quot; na agenda: mudar o percentual depois não altera o que já
            foi fechado. Veja o total do mês em Agenda → Comissões.
          </p>
        </section>
      )}

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
