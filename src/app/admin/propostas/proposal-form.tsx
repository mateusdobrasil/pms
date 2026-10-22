"use client";

import { useActionState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { centsToInput } from "@/lib/money";
import { formatPhone } from "@/lib/format";
import { DEFAULT_PROPOSAL_ITEMS, type Proposal } from "@/lib/proposals";
import { BILLING } from "@/lib/billing";
import { emailProposal, saveProposal, type ProposalState } from "./actions";

const input = "w-full rounded-lg border px-3 py-2 text-sm";
const primaryButton =
  "rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50";

function Feedback({ state }: { state: ProposalState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}
    </>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function ProposalForm({ proposal, defaultValidUntil }: { proposal: Proposal | null; defaultValidUntil: string }) {
  const [state, action, pending] = useActionState<ProposalState, FormData>(saveProposal, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      {proposal && <input type="hidden" name="id" value={proposal.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do contato">
          <input name="client_name" required defaultValue={proposal?.client_name} placeholder="Maria da Silva" className={input} />
        </Field>
        <Field label="Nome do negócio">
          <input name="business_name" required defaultValue={proposal?.business_name} placeholder="Kadosh Cabelos" className={input} />
        </Field>
        <Field label="E-mail (para enviar a proposta)">
          <input name="email" type="email" defaultValue={proposal?.email ?? ""} className={input} />
        </Field>
        <Field label="WhatsApp">
          <input name="whatsapp" inputMode="tel" defaultValue={proposal?.whatsapp ? formatPhone(proposal.whatsapp) : ""} placeholder="(11) 98888-7777" className={input} />
        </Field>
        <Field label="Implantação (R$)" hint="Pagamento único. Vazio ou 0 = isenta.">
          <input
            name="setup_fee"
            inputMode="decimal"
            defaultValue={proposal ? centsToInput(proposal.setup_fee_cents || null) : centsToInput(BILLING.setupFeeCents)}
            className={input}
          />
        </Field>
        <Field label="Mensalidade (R$)" hint={`Vence todo dia ${BILLING.dueDay}. Vazio ou 0 = isenta.`}>
          <input
            name="monthly_fee"
            inputMode="decimal"
            defaultValue={proposal ? centsToInput(proposal.monthly_fee_cents || null) : centsToInput(BILLING.monthlyFeeCents)}
            className={input}
          />
        </Field>
        <Field label="Válida até">
          <input name="valid_until" type="date" required defaultValue={proposal?.valid_until ?? defaultValidUntil} className={input} />
        </Field>
      </div>
      <Field label="O que está incluído" hint="Um item por linha. Já vem com os recursos da plataforma: edite à vontade.">
        <textarea name="items" rows={11} defaultValue={proposal?.items ?? DEFAULT_PROPOSAL_ITEMS} className={input} />
      </Field>
      <Field label="Condições e observações (opcional)" hint="Ex.: prazo de entrega da loja, desconto à vista, fidelidade.">
        <textarea name="notes" rows={4} defaultValue={proposal?.notes ?? ""} className={input} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : proposal ? "Salvar proposta" : "Criar proposta"}
      </button>
    </form>
  );
}

export function EmailProposalButton({ id, email }: { id: string; email: string | null }) {
  const [state, action, pending] = useActionState<ProposalState, FormData>(emailProposal, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending || !email} className={`${primaryButton} w-full`} title={email ? undefined : "Cadastre o e-mail do cliente"}>
        {pending ? "Enviando…" : "Enviar por e-mail"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
