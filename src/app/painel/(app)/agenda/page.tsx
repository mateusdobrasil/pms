import Link from "next/link";
import { formatPhone } from "@/lib/format";
import { COUNTER_PAYMENTS, type CounterPayment } from "@/lib/counter";
import { ReceiveBooking } from "./receive-booking";
import { UsePackage } from "./use-package";
import { customerKeys, loadCustomerPackages } from "@/lib/packages-server";
import { pickPackage, remaining } from "@/lib/packages";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { addDays, todayBR } from "@/lib/billing";
import { BOOKING_STATUS, formatDuration, type BookingStatus } from "@/lib/booking";
import { dayStartMs, weekdayOf } from "@/lib/booking-slots";
import { BookingActions, ManualBookingForm } from "./agenda-forms";

export const metadata = { title: "Agenda · Painel" };

type Booking = {
  id: string;
  code: string;
  status: BookingStatus;
  service_id: string | null;
  service_name: string;
  professional_id: string | null;
  professional_name: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  price_cents: number;
  online_cents: number;
  paid_cents: number;
  source: string;
};
type Block = { professional_id: string | null; starts_at: string; ends_at: string; reason: string | null };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dayLabel = (d: string) => `${WEEK[weekdayOf(d)]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;

function money(b: Booking) {
  const toReceive = b.price_cents - b.paid_cents;
  if (b.status === "pending_payment") return `aguardando pagamento online de ${formatBRL(b.online_cents)}`;
  const parts = [b.paid_cents ? `pago online ${formatBRL(b.paid_cents)}` : null, toReceive > 0 ? `receber ${formatBRL(toReceive)}` : "tudo pago"];
  return parts.filter(Boolean).join(" · ");
}

type Receipt = { total_cents: number; counter_payment: CounterPayment };

type PackageOffer = { id: string; left: number; name: string };

function BookingCard({ b, now, receipt, pkg, usedPackage }: { b: Booking; now: number; receipt?: Receipt; pkg?: PackageOffer | null; usedPackage?: boolean }) {
  const due = Math.max(0, b.price_cents - b.paid_cents);
  const s = BOOKING_STATUS[b.status];
  const faded = b.status === "canceled" || b.status === "expired";
  return (
    <li className={`space-y-1.5 rounded-lg border bg-white p-3 text-sm shadow-sm ${faded ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">{hm(b.starts_at)}–{hm(b.ends_at)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.tone}`}>{s.label}</span>
      </div>
      <p className="font-medium">{b.customer_name}{b.source === "store" && <span className="ml-1 text-xs font-normal text-neutral-400">(encaixe)</span>}</p>
      <p className="text-neutral-600">{b.service_name}</p>
      {b.customer_phone && (
        <a href={`https://wa.me/55${b.customer_phone}`} target="_blank" rel="noopener noreferrer" className="block text-xs font-medium text-emerald-700 underline">
          WhatsApp do cliente
        </a>
      )}
      {!faded && !receipt && !usedPackage && <p className="text-xs text-neutral-500">{money(b)}</p>}
      {b.notes && <p className="text-xs text-neutral-500">“{b.notes}”</p>}
      {receipt && (
        <p className="text-xs font-medium text-emerald-700">
          Recebido no salão: {formatBRL(receipt.total_cents)} · {COUNTER_PAYMENTS[receipt.counter_payment]}
        </p>
      )}
      {usedPackage && <p className="text-xs font-medium text-violet-700">Sessão de pacote usada</p>}
      {(b.status === "confirmed" || b.status === "completed") && !receipt && !usedPackage && (
        <div className="flex flex-wrap gap-2">
          {pkg && <UsePackage bookingId={b.id} packageId={pkg.id} left={pkg.left} name={pkg.name} />}
          {due > 0 && <ReceiveBooking bookingId={b.id} dueCents={due} />}
        </div>
      )}
      {b.status === "confirmed" && <BookingActions id={b.id} paidLabel={b.paid_cents ? formatBRL(b.paid_cents) : null} past={Date.parse(b.starts_at) < now} />}
    </li>
  );
}

type Waiting = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notify_count: number;
  services: { name: string } | null;
  professionals: { name: string } | null;
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string; visao?: string }> }) {
  const { supabase, store } = await requireStore();
  const sp = await searchParams;
  const today = todayBR();
  const date = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : today;
  const week = sp.visao === "semana";
  // Semana: de segunda a domingo da semana do dia escolhido.
  const from = week ? addDays(date, -((weekdayOf(date) + 6) % 7)) : date;
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [date];
  const startIso = new Date(dayStartMs(from)).toISOString();
  const endIso = new Date(dayStartMs(addDays(days.at(-1)!, 1))).toISOString();

  const [{ data: services }, { data: pros }, { data: rows }, { data: blocks }, { data: settings }] = await Promise.all([
    supabase.from("services").select("id, name, duration_minutes").eq("store_id", store.id).eq("active", true).order("position").order("name"),
    supabase.from("professionals").select("id, name, active, working_hours(id), professional_services(service_id)").eq("store_id", store.id).order("position").order("name"),
    supabase
      .from("bookings")
      .select("id, code, status, service_id, service_name, professional_id, professional_name, starts_at, ends_at, customer_name, customer_phone, customer_email, notes, price_cents, online_cents, paid_cents, source")
      .eq("store_id", store.id)
      .neq("status", "expired")
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at"),
    supabase.from("time_off").select("professional_id, starts_at, ends_at, reason").eq("store_id", store.id).lt("starts_at", endIso).gt("ends_at", startIso),
    supabase.from("stores").select("booking_enabled").eq("id", store.id).single(),
  ]);
  const bookings = (rows ?? []) as Booking[];
  // Recebimentos no salão (vendas de balcão ligadas ao agendamento). Sem o SQL 20261115000000, nenhum.
  const { data: receiptRows } = bookings.length
    ? await supabase.from("orders").select("booking_id, total_cents, counter_payment").eq("store_id", store.id).in("booking_id", bookings.map((x) => x.id)).neq("status", "canceled")
    : { data: [] };
  const receipts = new Map(((receiptRows ?? []) as (Receipt & { booking_id: string })[]).map((r) => [r.booking_id, r]));
  // Pacotes: o cliente tem pacote ativo do serviço? Agendamento já usou sessão? (Sem o SQL dos pacotes, nada.)
  const open = bookings.filter((x) => x.status === "confirmed" || x.status === "completed");
  const pkgs = open.length ? await loadCustomerPackages(supabase, store.id, [...new Set(open.flatMap((x) => customerKeys(x.customer_phone, x.customer_email)))]) : [];
  const { data: useRows } = open.length ? await supabase.from("package_uses").select("booking_id").in("booking_id", open.map((x) => x.id)) : { data: [] };
  const usedFor = new Set(((useRows ?? []) as { booking_id: string }[]).map((u) => u.booking_id));
  const offerFor = (x: Booking): PackageOffer | null => {
    const keys = customerKeys(x.customer_phone, x.customer_email);
    const p = pickPackage(pkgs.filter((k) => keys.includes(k.customer_key)), x.service_id);
    return p ? { id: p.id, left: remaining(p), name: p.name } : null;
  };
  // Lista de espera do dia (visão do dia). Sem o SQL da lista, a consulta falha e a seção não aparece.
  const { data: waitRows } = week
    ? { data: null }
    : await supabase
        .from("booking_waitlist")
        .select("id, customer_name, customer_phone, customer_email, notify_count, services(name), professionals(name)")
        .eq("store_id", store.id)
        .eq("date", date)
        .eq("status", "waiting")
        .order("created_at");
  const waiting = (waitRows ?? []) as unknown as Waiting[];
  const professionals = (pros ?? []) as { id: string; name: string; active: boolean; working_hours: { id: string }[]; professional_services: { service_id: string }[] }[];
  const active = professionals.filter((p) => p.active);
  const now = new Date().getTime();

  // Passo a passo enquanto a agenda não está pronta.
  const steps = [
    { done: (services ?? []).length > 0, text: "Cadastre os serviços (duração, preço e forma de pagamento)", href: "/painel/agenda/servicos" },
    { done: active.length > 0, text: "Cadastre os profissionais", href: "/painel/agenda/profissionais" },
    { done: active.some((p) => p.working_hours.length && p.professional_services.length), text: "Em cada profissional, marque os serviços que ele faz e os horários de trabalho", href: "/painel/agenda/profissionais" },
    { done: !!settings?.booking_enabled, text: "Ligue os agendamentos em Configurações → Agendamentos", href: "/painel/configuracoes#agendamentos" },
  ];

  const nav = (d: string, w = week) => `/painel/agenda?dia=${d}${w ? "&visao=semana" : ""}`;
  const step = week ? 7 : 1;
  const confirmedToday = bookings.filter((b) => b.status === "confirmed" || b.status === "pending_payment").length;

  return (
    <div className="space-y-6">
      {steps.some((s) => !s.done) && (
        <section className="max-w-2xl space-y-3 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-medium">Deixe a agenda pronta</h2>
          <ol className="space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{s.done ? "✓" : i + 1}</span>
                <Link href={s.href} className={s.done ? "text-neutral-500 line-through" : "hover:underline"}>{s.text}</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={nav(addDays(date, -step))} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400" aria-label="Anterior">←</Link>
        <Link href={nav(today)} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400">Hoje</Link>
        <Link href={nav(addDays(date, step))} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400" aria-label="Próximo">→</Link>
        <h2 className="ml-1 text-lg font-semibold">{week ? `Semana de ${dayLabel(days[0])} a ${dayLabel(days[6])}` : `${dayLabel(date)}${date === today ? " (hoje)" : ""}`}</h2>
        <span className="text-sm text-neutral-500">{confirmedToday} agendamento(s)</span>
        <div className="ml-auto flex overflow-hidden rounded-md border bg-white text-sm">
          <Link href={nav(date, false)} className={`px-3 py-1.5 ${!week ? "bg-primary-600 text-white" : "hover:bg-neutral-50"}`}>Dia</Link>
          <Link href={nav(date, true)} className={`px-3 py-1.5 ${week ? "bg-primary-600 text-white" : "hover:bg-neutral-50"}`}>Semana</Link>
        </div>
      </div>

      {(services ?? []).length > 0 && active.length > 0 && (
        <details className="rounded-xl border bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">+ Encaixar cliente (balcão ou WhatsApp)</summary>
          <div className="mt-4">
            <ManualBookingForm
              services={(services ?? []).map((s) => ({ id: s.id, name: s.name, duration: formatDuration(s.duration_minutes) }))}
              professionals={active.map((p) => ({ id: p.id, name: p.name }))}
              date={date}
            />
          </div>
        </details>
      )}

      {week ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = bookings.filter((b) => b.starts_at >= new Date(dayStartMs(d)).toISOString() && b.starts_at < new Date(dayStartMs(addDays(d, 1))).toISOString());
            return (
              <section key={d} className={`rounded-xl border bg-white p-3 shadow-sm ${d === today ? "ring-2 ring-primary-300" : ""}`}>
                <Link href={nav(d, false)} className="block text-sm font-semibold hover:underline">{dayLabel(d)}</Link>
                {list.length === 0 ? (
                  <p className="mt-2 text-xs text-neutral-400">Livre</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {list.map((b) => (
                      <li key={b.id} className={b.status === "canceled" ? "text-neutral-400 line-through" : ""}>
                        <span className="font-semibold tabular-nums">{hm(b.starts_at)}</span> {b.customer_name}
                        <span className="block text-neutral-500">{b.service_name} · {b.professional_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : active.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">Cadastre os profissionais para ver a agenda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => {
            const list = bookings.filter((b) => b.professional_id === p.id);
            const off = ((blocks ?? []) as Block[]).filter((t) => !t.professional_id || t.professional_id === p.id);
            return (
              <section key={p.id} className="space-y-2">
                <h3 className="font-semibold">{p.name}</h3>
                {off.map((t, i) => (
                  <p key={i} className="rounded-lg bg-neutral-200/70 px-3 py-2 text-xs text-neutral-600">
                    Bloqueado {t.professional_id ? "" : "(salão todo) "}
                    {Date.parse(t.starts_at) <= dayStartMs(date) && Date.parse(t.ends_at) >= dayStartMs(addDays(date, 1)) ? "o dia inteiro" : `${hm(t.starts_at)}–${hm(t.ends_at)}`}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </p>
                ))}
                {list.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-neutral-400">Nenhum agendamento</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((b) => (
                      <BookingCard key={b.id} b={b} now={now} receipt={receipts.get(b.id)} pkg={offerFor(b)} usedPackage={usedFor.has(b.id)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {waiting.length > 0 && (
        <section className="rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-4 py-3 font-medium">Lista de espera deste dia ({waiting.length})</h2>
          <p className="px-4 pt-3 text-xs text-neutral-500">
            Se alguém cancelar ou remarcar, quem está aqui recebe um e-mail na hora. Você também pode chamar pelo WhatsApp para encaixar.
          </p>
          <ul className="divide-y text-sm">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{w.customer_name}</span>
                  <span className="text-neutral-500">
                    {" "}· {w.services?.name ?? "serviço removido"}
                    {w.professionals ? ` com ${w.professionals.name}` : ""}
                    {w.notify_count > 0 ? ` · avisado ${w.notify_count === 1 ? "1 vez" : `${w.notify_count} vezes`}` : ""}
                  </span>
                </span>
                <a href={`https://wa.me/55${w.customer_phone}`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">
                  {formatPhone(w.customer_phone)} · WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
