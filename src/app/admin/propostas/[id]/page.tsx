import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isUuid } from "@/lib/validation";
import { formatDateTime } from "@/lib/format";
import { platformUrl } from "@/lib/urls";
import { todayBR } from "@/lib/billing";
import { PROPOSAL_FIELDS, type Proposal, proposalStatus } from "@/lib/proposals";
import { EmailProposalButton, ProposalForm } from "../proposal-form";
import { StatusPill } from "../status-pill";
import { deleteProposal, whatsappProposal } from "../actions";

export const metadata = { title: "Proposta · PMS app" };

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireAdmin();
  const { data } = await db.from("proposals").select(PROPOSAL_FIELDS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Proposal;
  // Prova do aceite dos Termos de uso (colunas do SQL 20261028000000, lidas à parte).
  const { data: proofRow } = await db.from("proposals").select("terms_version, accepted_ip, accepted_user_agent").eq("id", id).maybeSingle();
  const proof = proofRow as { terms_version: string | null; accepted_ip: string | null; accepted_user_agent: string | null } | null;
  const url = platformUrl(`/proposta/${p.public_token}`);
  const created = (await searchParams).criada;
  const status = proposalStatus(p, todayBR());
  const card = "space-y-3 rounded-xl border bg-white p-5 shadow-sm";
  // Proposta aceita → criar a loja já com nome e e-mail (cobrança é configurada depois, na página da loja).
  const createStoreHref = `/admin?${new URLSearchParams({ nome: p.business_name, ...(p.email ? { email: p.email } : {}) })}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/propostas" className="text-sm text-neutral-500 underline">← Propostas</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.business_name}</h1>
          <StatusPill status={status} />
        </div>
        <p className="text-sm text-neutral-500">Criada em {formatDateTime(p.created_at)}</p>
      </div>
      {created && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Proposta criada. Confira como o cliente vai ver e envie.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProposalForm proposal={p} defaultValidUntil={p.valid_until} />
        </div>

        <div className="space-y-6">
          <section className={card}>
            <h2 className="font-semibold">Enviar ao cliente</h2>
            <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border px-4 py-2 text-center text-sm font-medium hover:bg-neutral-50">
              Ver como o cliente vê ↗
            </a>
            <code className="block break-all rounded bg-neutral-50 px-2 py-1.5 font-mono text-xs">{url}</code>
            <EmailProposalButton id={p.id} email={p.email} />
            <form action={whatsappProposal}>
              <input type="hidden" name="id" value={p.id} />
              <button
                type="submit"
                disabled={!p.whatsapp}
                title={p.whatsapp ? undefined : "Cadastre o WhatsApp do cliente"}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                Enviar pelo WhatsApp
              </button>
            </form>
            <p className="text-xs text-neutral-500">Salve as alterações antes de enviar. O link sempre mostra a versão mais recente.</p>
          </section>

          <section className={card}>
            <h2 className="font-semibold">Acompanhamento</h2>
            <ul className="space-y-1 text-sm text-neutral-600">
              <li>Enviada: {p.sent_at ? formatDateTime(p.sent_at) : "ainda não"}</li>
              <li>Aberta pelo cliente: {p.viewed_at ? formatDateTime(p.viewed_at) : "ainda não"}</li>
              <li>Aceita: {p.accepted_at ? formatDateTime(p.accepted_at) : "ainda não"}</li>
            </ul>
            {p.accepted_at && proof?.terms_version && (
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Aceitou os{" "}
                <a href="/termos" target="_blank" rel="noopener" className="underline">Termos de uso</a> versão {proof.terms_version}
                {proof.accepted_ip && ` · IP ${proof.accepted_ip}`}
                {proof.accepted_user_agent && <span className="block truncate" title={proof.accepted_user_agent}>{proof.accepted_user_agent}</span>}
              </p>
            )}
            {p.accepted_at && (
              <Link href={createStoreHref} className="block rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700">
                Criar a loja deste cliente
              </Link>
            )}
          </section>

          <form action={deleteProposal}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="text-sm text-red-700 underline">Excluir proposta</button>
          </form>
        </div>
      </div>
    </div>
  );
}
