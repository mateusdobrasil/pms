import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { addDays, todayBR } from "@/lib/billing";
import { BOOKING_STATUS, type BookingStatus } from "@/lib/booking";
import { dayStartMs, weekdayOf } from "@/lib/booking-slots";
import { monthOf, parseMonthParam } from "@/lib/monthly-report";
import { percentLabel } from "@/lib/commission";
import { loadCommissions } from "@/lib/commission-server";

export const metadata = { title: "Minha agenda · Painel" };

type Booking = { id: string; status: BookingStatus; service_name: string; starts_at: string; ends_at: string; customer_name: string; notes: string | null };
type Block = { professional_id: string | null; starts_at: string; ends_at: string; reason: string | null };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dayLabel = (d: string) => `${WEEK[weekdayOf(d)]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Tela do profissional: só os próprios agendamentos e a própria comissão. As policies não deixam o perfil
// "professional" ler nada; aqui o servidor lê com a service role, sempre filtrando pelo cadastro dele.
export default async function MyAgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { store, professionalId } = await requireStore("minha-agenda");
  if (!professionalId) {
    return (
      <p className="max-w-xl rounded-xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
        Seu acesso ainda não está ligado a um profissional da agenda. Peça ao responsável pela loja para ligar em Conta → Equipe.
      </p>
    );
  }
  const db = createAdminClient();
  const sp = await searchParams;
  const today = todayBR();
  const date = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : today;
  const from = addDays(date, -((weekdayOf(date) + 6) % 7)); // segunda da semana
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const startIso = new Date(dayStartMs(from)).toISOString();
  const endIso = new Date(dayStartMs(addDays(days[6], 1))).toISOString();
  const { year, month } = parseMonthParam(undefined, today);
  const m = monthOf(year, month);

  const [{ data: pro }, { data: rows }, { data: blocks }, commissions] = await Promise.all([
    db.from("professionals").select("name").eq("id", professionalId).eq("store_id", store.id).maybeSingle(),
    db
      .from("bookings")
      .select("id, status, service_name, starts_at, ends_at, customer_name, notes")
      .eq("store_id", store.id)
      .eq("professional_id", professionalId)
      .in("status", ["confirmed", "completed", "no_show", "pending_payment"])
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at"),
    db.from("time_off").select("professional_id, starts_at, ends_at, reason").eq("store_id", store.id).lt("starts_at", endIso).gt("ends_at", startIso),
    loadCommissions(db, store.id, m.from, m.to),
  ]);
  const bookings = (rows ?? []) as Booking[];
  const off = ((blocks ?? []) as Block[]).filter((t) => !t.professional_id || t.professional_id === professionalId);
  const mine = commissions.professionals.find((p) => p.professionalId === professionalId);
  const nav = (d: string) => `/painel/minha-agenda?dia=${d}`;
  const monthLabel = m.label.charAt(0).toUpperCase() + m.label.slice(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha agenda</h1>
        {pro && <p className="text-sm text-neutral-600">{pro.name}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={nav(addDays(date, -7))} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400" aria-label="Semana anterior">←</Link>
        <Link href={nav(today)} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400">Hoje</Link>
        <Link href={nav(addDays(date, 7))} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400" aria-label="Próxima semana">→</Link>
        <h2 className="ml-1 text-lg font-semibold">Semana de {dayLabel(days[0])} a {dayLabel(days[6])}</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const start = dayStartMs(d), end = dayStartMs(addDays(d, 1));
          const list = bookings.filter((b) => Date.parse(b.starts_at) >= start && Date.parse(b.starts_at) < end);
          const dayOff = off.filter((t) => Date.parse(t.starts_at) < end && Date.parse(t.ends_at) > start);
          return (
            <section key={d} className={`rounded-xl border bg-white p-3 shadow-sm ${d === today ? "ring-2 ring-primary-300" : ""}`}>
              <p className="text-sm font-semibold">{dayLabel(d)}</p>
              {dayOff.map((t, i) => (
                <p key={i} className="mt-2 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                  Bloqueado {Date.parse(t.starts_at) <= start && Date.parse(t.ends_at) >= end ? "o dia inteiro" : `${hm(t.starts_at)}–${hm(t.ends_at)}`}
                  {t.reason ? ` · ${t.reason}` : ""}
                </p>
              ))}
              {list.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-400">Livre</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs">
                  {list.map((b) => (
                    <li key={b.id} className="space-y-0.5">
                      <span className="font-semibold tabular-nums">{hm(b.starts_at)}–{hm(b.ends_at)}</span> {b.customer_name}
                      <span className="block text-neutral-500">{b.service_name}</span>
                      {b.status !== "confirmed" && <span className="block text-neutral-500">{BOOKING_STATUS[b.status].label}</span>}
                      {b.notes && <span className="block text-neutral-500">“{b.notes}”</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">Minha comissão · {monthLabel}</h2>
          <span className="text-lg font-semibold text-emerald-700">{formatBRL(mine?.commissionCents ?? 0)}</span>
        </div>
        {!mine || mine.attended === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Nenhum atendimento marcado como &quot;Atendido&quot; neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
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
                {mine.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2">{new Date(l.starts_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</td>
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
        )}
        <p className="border-t px-4 py-3 text-xs text-neutral-500">
          Entram os atendimentos marcados como &quot;Atendido&quot; pela loja. Algo faltando? Fale com o responsável pela loja.
        </p>
      </section>
    </div>
  );
}
