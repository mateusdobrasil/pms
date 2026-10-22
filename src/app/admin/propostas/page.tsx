import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatBRL } from "@/lib/money";
import { formatDay, todayBR } from "@/lib/billing";
import { PROPOSAL_FIELDS, type Proposal, proposalStatus } from "@/lib/proposals";
import { StatusPill } from "./status-pill";

export const metadata = { title: "Propostas · PMS app" };

const fee = (cents: number) => (cents ? formatBRL(cents) : "isenta");

export default async function ProposalsPage() {
  const { db } = await requireAdmin();
  const { data, error } = await db.from("proposals").select(PROPOSAL_FIELDS).order("created_at", { ascending: false });
  const proposals = (data ?? []) as Proposal[];
  const today = todayBR();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Propostas ({proposals.length})</h1>
        <Link href="/admin/propostas/nova" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">
          + Nova proposta
        </Link>
      </div>
      {error ? (
        <p className="rounded-xl border bg-white p-5 text-sm text-neutral-500">Rode o SQL 20261026000000_propostas_comerciais.sql para usar as propostas.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/propostas/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.business_name}</p>
                  <p className="truncate text-neutral-500">
                    {p.client_name} · implantação {fee(p.setup_fee_cents)} · mensalidade {fee(p.monthly_fee_cents)} · válida até {formatDay(p.valid_until)}
                  </p>
                </div>
                <StatusPill status={proposalStatus(p, today)} />
              </Link>
            </li>
          ))}
          {proposals.length === 0 && <li className="px-4 py-8 text-center text-neutral-500">Nenhuma proposta ainda.</li>}
        </ul>
      )}
    </div>
  );
}
