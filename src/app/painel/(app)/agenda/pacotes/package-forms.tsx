"use client";

import { useActionState, useState, useTransition } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { cancelPackageAction, createPackage, redeemSessionAtCounter, type PackageFormState } from "./actions";

const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

export function CreatePackageForm({ services }: { services: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PackageFormState, FormData>(createPackage, null);
  return (
    <form key={state?.ok ?? "novo"} onSubmit={submitKeepingValues(action)} className="grid gap-3 text-sm sm:grid-cols-6">
      <label className="block space-y-1 sm:col-span-3">
        <span className="font-medium text-neutral-700">Serviço</span>
        <select name="service_id" required className={input} defaultValue="">
          <option value="" disabled>Escolha…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium text-neutral-700">Sessões</span>
        <input name="sessions" type="number" min={2} max={100} defaultValue={5} required className={input} />
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className="font-medium text-neutral-700">Preço do pacote (R$)</span>
        <input name="price" inputMode="decimal" required placeholder="200,00" className={input} />
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className="font-medium text-neutral-700">Validade (dias)</span>
        <input name="validity" type="number" min={1} max={1095} placeholder="ex.: 90 (vazio = sem validade)" className={input} />
      </label>
      <label className="block space-y-1 sm:col-span-4">
        <span className="font-medium text-neutral-700">Nome (opcional)</span>
        <input name="name" maxLength={80} placeholder='ex.: "Pacote 5 escovas" (vazio = "5 × Escova")' className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Criando…" : "Criar pacote"}
        </button>
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}

// No pacote do cliente: usar uma sessão no balcão (escolhendo quem atendeu) ou cancelar o pacote.
export function CustomerPackageActions({ id, pros, canCancel }: { id: string; pros: { id: string; name: string }[]; canCancel: boolean }) {
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const redeem = (professionalId: string) =>
    startTransition(async () => {
      const r = await redeemSessionAtCounter(id, professionalId);
      setPicking(false);
      setMessage(r.ok ? (r.left === 0 ? "Última sessão usada: pacote concluído." : `Sessão usada. Restam ${r.left}.`) : r.error);
    });

  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {!picking ? (
          <button type="button" disabled={pending} onClick={() => (pros.length === 1 ? redeem(pros[0].id) : setPicking(true))} className="rounded-md bg-neutral-900 px-2.5 py-1 font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
            Usar sessão
          </button>
        ) : (
          <>
            <span className="text-neutral-500">Quem atendeu?</span>
            {pros.map((p) => (
              <button key={p.id} type="button" disabled={pending} onClick={() => redeem(p.id)} className="rounded-md border px-2 py-1 font-medium hover:border-neutral-400 disabled:opacity-50">
                {p.name}
              </button>
            ))}
            <button type="button" onClick={() => setPicking(false)} className="text-neutral-500 hover:underline">Voltar</button>
          </>
        )}
        {canCancel && <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancelar este pacote? As sessões que sobraram deixam de valer (devolva o valor ao cliente, se for o caso).")) startTransition(() => cancelPackageAction(id));
          }}
          className="px-1 font-medium text-red-700 hover:underline disabled:opacity-50"
        >
          Cancelar pacote
        </button>}
      </div>
      {message && <p className="text-neutral-600">{message}</p>}
    </div>
  );
}
