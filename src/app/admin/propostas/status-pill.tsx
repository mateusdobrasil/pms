import type { ProposalStatus } from "@/lib/proposals";

const STYLES: Record<ProposalStatus, string> = {
  rascunho: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  enviada: "bg-blue-100 text-blue-800 ring-blue-200",
  vista: "bg-amber-100 text-amber-900 ring-amber-200",
  aceita: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  vencida: "bg-red-100 text-red-800 ring-red-200",
};

const LABELS: Record<ProposalStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  vista: "Vista pelo cliente",
  aceita: "Aceita",
  vencida: "Vencida",
};

export function StatusPill({ status }: { status: ProposalStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>{LABELS[status]}</span>;
}
