import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, todayBR } from "@/lib/billing";
import { PROPOSAL_VALID_DAYS } from "@/lib/proposals";
import { ProposalForm } from "../proposal-form";

export const metadata = { title: "Nova proposta · PMS app" };

export default async function NewProposalPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/admin/propostas" className="text-sm text-neutral-500 underline">← Propostas</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nova proposta</h1>
      </div>
      <ProposalForm proposal={null} defaultValidUntil={addDays(todayBR(), PROPOSAL_VALID_DAYS)} />
    </div>
  );
}
