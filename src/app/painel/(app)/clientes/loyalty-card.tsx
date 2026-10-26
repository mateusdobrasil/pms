"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { centsToInput } from "@/lib/money";
import { LOYALTY_COUNTS, type LoyaltyConfig } from "@/lib/loyalty";
import { saveLoyalty, type LoyaltyState } from "./actions";

const input = "rounded-md border bg-white px-3 py-2 text-sm";

// Configuração do cartão fidelidade (no topo de Clientes). Aberto quando ainda está desligado.
export function LoyaltyCard({ config, agenda, startedLabel }: { config: LoyaltyConfig & { rawEnabled: boolean }; agenda: boolean; startedLabel: string | null }) {
  const [state, action, pending] = useActionState<LoyaltyState, FormData>(saveLoyalty, null);
  // Abre sozinho só na primeira visita com o cartão desligado; depois de salvar, continua como o lojista deixou.
  const [open, setOpen] = useState(!config.rawEnabled);
  return (
    <details className="rounded-xl border bg-white text-sm shadow-sm" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer px-4 py-3 font-medium">
        🎟️ Cartão fidelidade{" "}
        {config.enabled ? (
          <span className="font-normal text-emerald-700">
            · ligado: a cada {config.goal} {LOYALTY_COUNTS[config.counts]}, {config.reward}
          </span>
        ) : (
          <span className="font-normal text-neutral-500">· desligado</span>
        )}
      </summary>
      <form onSubmit={submitKeepingValues(action)} className="space-y-3 border-t px-4 py-4">
        <p className="text-neutral-600">
          O &quot;cartão de carimbos&quot; digital: cada {agenda ? "atendimento marcado como Atendido e cada " : ""}compra paga conta um carimbo. Ao completar,
          o cliente recebe um e-mail com o prêmio e você é avisado. O progresso aparece nos e-mails de confirmação.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={config.rawEnabled} /> <span className="font-medium">Cartão fidelidade ligado</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span>A cada</span>
          <input name="goal" type="number" min={2} max={50} defaultValue={config.goal} className={`${input} w-20`} />
          <select name="counts" defaultValue={agenda ? config.counts : "orders"} className={input}>
            {agenda && <option value="both">atendimentos e compras</option>}
            {agenda && <option value="bookings">atendimentos</option>}
            <option value="orders">compras</option>
          </select>
          <span>o cliente ganha</span>
          <input name="reward" defaultValue={config.reward} placeholder='ex.: "1 corte grátis"' maxLength={120} className={`${input} min-w-48 flex-1`} />
        </div>
        <label className="flex flex-wrap items-center gap-2">
          <span>Compra conta a partir de R$</span>
          <input name="min_order" inputMode="decimal" defaultValue={centsToInput(config.minOrderCents)} placeholder="0,00" className={`${input} w-28`} />
          <span className="text-xs text-neutral-500">(0 = qualquer valor)</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "Salvando…" : "Salvar"}
          </button>
          {state?.error && <span className="text-red-700">{state.error}</span>}
          {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
        </div>
        <p className="text-xs text-neutral-500">
          {startedLabel
            ? `Contando carimbos desde ${startedLabel}. Mudar a meta ou o prêmio vale para os próximos cartões.`
            : "Os carimbos começam a contar a partir do momento em que você ligar."}{" "}
          Você entrega o prêmio na próxima visita ou compra e dá baixa aqui em Clientes.
        </p>
      </form>
    </details>
  );
}
