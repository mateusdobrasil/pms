import { requireStore } from "@/lib/panel";
import { monthOf, parseMonthParam } from "@/lib/monthly-report";
import { loadCommissions } from "@/lib/commission-server";
import { todayBR } from "@/lib/billing";

// Planilha para o Excel em português: separador ";", vírgula decimal e BOM para os acentos.
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", "");

// Comissões do mês, uma linha por atendimento, com o total de cada profissional no fim.
export async function GET(req: Request) {
  const { supabase, store } = await requireStore();
  const { year, month } = parseMonthParam(new URL(req.url).searchParams.get("mes") ?? undefined, todayBR());
  const m = monthOf(year, month);
  const { professionals } = await loadCommissions(supabase, store.id, m.from, m.to);

  const header = ["Profissional", "Dia", "Cliente", "Serviço", "Valor (R$)", "Comissão (%)", "Comissão (R$)"];
  const lines: string[] = [];
  for (const p of professionals.filter((x) => x.attended > 0)) {
    for (const l of p.lines) {
      lines.push([p.name, dateTime(l.starts_at), l.customer_name, l.service_name, money(l.price_cents), l.percent == null ? "" : String(l.percent).replace(".", ","), money(l.commissionCents)].map(cell).join(";"));
    }
    lines.push([`Total ${p.name}`, "", `${p.attended} ${p.attended === 1 ? "atendimento" : "atendimentos"}`, "", money(p.producedCents), "", money(p.commissionCents)].map(cell).join(";"));
  }

  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${store.slug}-${year}-${String(month).padStart(2, "0")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
