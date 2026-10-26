import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { todayBR } from "@/lib/billing";
import { monthOf, parseMonthParam, shiftMonth } from "@/lib/monthly-report";
import { percentLabel } from "@/lib/commission";
import { loadCommissions } from "@/lib/commission-server";

export const metadata = { title: "Comissões · Agenda" };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;
};

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

// Fechamento do mês por profissional: atendimentos marcados como "Atendido", valor produzido e comissão.
// "?mes=2026-10"; sem parâmetro, o mês atual (Brasília).
export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, store } = await requireStore();
  const { year, month } = parseMonthParam((await searchParams).mes, todayBR());
  const m = monthOf(year, month);
  const { professionals, hasColumns } = await loadCommissions(supabase, store.id, m.from, m.to);
  const prev = shiftMonth(year, month, -1), next = shiftMonth(year, month, 1);
  const produced = professionals.reduce((s, p) => s + p.producedCents, 0);
  const total = professionals.reduce((s, p) => s + p.commissionCents, 0);
  const pending = professionals.reduce((s, p) => s + p.pendingConfirmation, 0);
  const label = m.label.charAt(0).toUpperCase() + m.label.slice(1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/painel/agenda/comissoes?mes=${key(prev.year, prev.month)}`} className="rounded-md border bg-white px-2.5 py-1.5 text-sm hover:border-neutral-400" aria-label="Mês anterior">←</Link>
          <h2 className="min-w-44 text-center text-lg font-semibold">{label}</h2>
          <Link href={`/painel/agenda/comissoes?mes=${key(next.year, next.month)}`} className="rounded-md border bg-white px-2.5 py-1.5 text-sm hover:border-neutral-400" aria-label="Próximo mês">→</Link>
        </div>
        {professionals.some((p) => p.attended > 0) && (
          <a href={`/painel/agenda/comissoes/exportar?mes=${key(year, month)}`} className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:border-neutral-400">
            Baixar planilha
          </a>
        )}
      </div>

      {!hasColumns && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">A comissão está sendo instalada. Os atendimentos já aparecem; os valores, em alguns minutos.</p>
      )}
      {pending > 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {pending} {pending === 1 ? "atendimento de um dia que já passou ainda está" : "atendimentos de dias que já passaram ainda estão"} como
          &quot;Confirmado&quot; e {pending === 1 ? "não entra" : "não entram"} na comissão. Marque como <strong>Atendido</strong> (ou Faltou) na{" "}
          <Link href="/painel/agenda" className="font-medium underline">agenda</Link>.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">Produzido no mês</p>
          <p className="text-2xl font-semibold">{formatBRL(produced)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">Comissões a pagar</p>
          <p className="text-2xl font-semibold text-emerald-700">{formatBRL(total)}</p>
        </div>
      </div>

      {professionals.every((p) => p.attended === 0) ? (
        <p className="rounded-xl border bg-white px-4 py-6 text-sm text-neutral-500 shadow-sm">Nenhum atendimento marcado como &quot;Atendido&quot; neste mês.</p>
      ) : (
        <div className="space-y-3">
          {professionals
            .filter((p) => p.attended > 0)
            .map((p) => (
              <details key={p.professionalId} className="rounded-xl border bg-white shadow-sm">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-sm text-neutral-500"> · {p.attended} {p.attended === 1 ? "atendimento" : "atendimentos"} · {formatBRL(p.producedCents)} produzidos</span>
                  </span>
                  <span className="text-lg font-semibold text-emerald-700">{formatBRL(p.commissionCents)}</span>
                </summary>
                {p.withoutRate > 0 && (
                  <p className="mx-4 mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {p.withoutRate} {p.withoutRate === 1 ? "atendimento sem percentual de comissão (conta" : "atendimentos sem percentual de comissão (contam"} R$ 0,00). Defina em{" "}
                    <Link href={`/painel/agenda/profissionais/${p.professionalId}`} className="font-medium underline">Profissionais</Link>.
                  </p>
                )}
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Dia</th>
                        <th className="px-4 py-2 font-medium">Cliente</th>
                        <th className="px-4 py-2 font-medium">Serviço</th>
                        <th className="px-4 py-2 text-right font-medium">Valor</th>
                        <th className="px-4 py-2 text-right font-medium">%</th>
                        <th className="px-4 py-2 text-right font-medium">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {p.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap px-4 py-2">{when(l.starts_at)}</td>
                          <td className="px-4 py-2">{l.customer_name}</td>
                          <td className="px-4 py-2">{l.service_name}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right">{formatBRL(l.price_cents)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right">{l.percent == null ? "—" : percentLabel(l.percent)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatBRL(l.commissionCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        Entram só os atendimentos marcados como &quot;Atendido&quot;, pelo valor do serviço no agendamento. O percentual fica gravado no momento em que
        você marca: mudar a comissão do profissional depois não altera o que já foi fechado.
      </p>
    </div>
  );
}
