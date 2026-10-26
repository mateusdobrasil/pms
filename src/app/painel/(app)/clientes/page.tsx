import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { storeBaseUrl } from "@/lib/urls";
import { SOLD_STATUSES } from "@/lib/order-status";
import { AWAY_DAYS, type Activity, daysSince, groupCustomers } from "@/lib/customers";
import { CustomerList, type CustomerRow } from "./customer-list";

export const metadata = { title: "Clientes · PMS app" };

const HISTORY_DAYS = 730; // 2 anos de pedidos e atendimentos
const MAX_ROWS = 300;

type OrderRow = { customer_name: string; customer_email: string; customer_phone: string | null; total_cents: number; paid_at: string };
type BookingRow = { customer_name: string; customer_email: string | null; customer_phone: string | null; price_cents: number; starts_at: string };
type ContactRow = { customer_key: string; contacted_at: string | null; do_not_contact: boolean };

// "sáb., 31/10 às 14:00"
const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
};

// Clientes que sumiram: quem comprou ou foi atendido e não volta há um tempo, com atalho para chamar no WhatsApp.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { supabase, store } = await requireStore();
  const sp = await searchParams;
  const away = sp.dias === "todos" ? 0 : (AWAY_DAYS as readonly number[]).includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const now = new Date();
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [{ data: orders }, { data: past }, { data: upcoming }, { data: contacts, error: contactsError }, { data: domains }, { data: bookingRow }] = await Promise.all([
    supabase
      .from("orders")
      .select("customer_name, customer_email, customer_phone, total_cents, paid_at")
      .eq("store_id", store.id)
      .in("status", SOLD_STATUSES)
      .gte("paid_at", since)
      .limit(5000),
    // Atendimentos: marcados como atendidos, ou confirmados com horário que já passou.
    supabase
      .from("bookings")
      .select("customer_name, customer_email, customer_phone, price_cents, starts_at")
      .eq("store_id", store.id)
      .in("status", ["completed", "confirmed"])
      .gte("starts_at", since)
      .lt("starts_at", nowIso)
      .limit(5000),
    supabase
      .from("bookings")
      .select("customer_email, customer_phone, starts_at")
      .eq("store_id", store.id)
      .in("status", ["confirmed", "pending_payment"])
      .gte("starts_at", nowIso)
      .limit(2000),
    supabase.from("customer_contacts").select("customer_key, contacted_at, do_not_contact").eq("store_id", store.id),
    supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id),
    supabase.from("stores").select("booking_enabled").eq("id", store.id).maybeSingle(),
  ]);

  const activities: Activity[] = [
    ...((orders ?? []) as OrderRow[]).map((o) => ({ kind: "order" as const, name: o.customer_name, phone: o.customer_phone, email: o.customer_email, at: o.paid_at, cents: o.total_cents })),
    ...((past ?? []) as BookingRow[]).map((b) => ({ kind: "booking" as const, name: b.customer_name, phone: b.customer_phone, email: b.customer_email, at: b.starts_at, cents: b.price_cents })),
  ];
  const customers = groupCustomers(
    activities,
    ((upcoming ?? []) as { customer_email: string | null; customer_phone: string | null; starts_at: string }[]).map((u) => ({ phone: u.customer_phone, email: u.customer_email, at: u.starts_at })),
  );
  const marks = new Map(((contacts ?? []) as ContactRow[]).map((c) => [c.customer_key, c]));

  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
  const base = domain ? storeBaseUrl(domain) : "";
  const agendaOn = !!(bookingRow as { booking_enabled?: boolean } | null)?.booking_enabled;

  const all: CustomerRow[] = customers.map((c) => {
    const mark = marks.get(c.key);
    return {
      key: c.key,
      name: c.name,
      phone: c.phone,
      email: c.email,
      orders: c.orders,
      bookings: c.bookings,
      totalCents: c.totalCents,
      daysAway: daysSince(c.lastAt, now),
      nextBooking: c.nextBookingAt ? when(c.nextBookingAt) : null,
      contactedDays: mark?.contacted_at ? daysSince(mark.contacted_at, now) : null,
      doNotContact: !!mark?.do_not_contact,
      link: agendaOn && c.bookings > 0 ? `${base}/agendar` : base,
    };
  });

  // Sumidos: sem horário marcado, há mais de N dias, e não marcados como "não chamar mais".
  // Ordem: quem você ainda não chamou (ou chamou há mais de 30 dias) primeiro, e os que mais gastaram no topo.
  const fresh = (c: CustomerRow) => c.contactedDays == null || c.contactedDays > 30;
  const list = all
    .filter((c) => (away ? c.daysAway >= away && !c.nextBooking && !c.doNotContact : true))
    .sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || b.totalCents - a.totalCents)
    .slice(0, MAX_ROWS);
  const optedOut = all.filter((c) => c.doNotContact).length;

  const tab = (value: string, label: string) => {
    const active = value === "todos" ? away === 0 : Number(value) === away;
    return (
      <Link
        key={value}
        href={`/painel/clientes?dias=${value}`}
        className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:border-neutral-400"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Quem já comprou{agendaOn ? " ou foi atendido" : ""} e não volta há um tempo. Uma mensagem no WhatsApp é o jeito mais barato de trazer
          o cliente de volta.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {AWAY_DAYS.map((d) => tab(String(d), `Sumidos há ${d}+ dias`))}
        {tab("todos", "Todos os clientes")}
      </div>

      <p className="text-sm text-neutral-600">
        {away
          ? `${list.length} ${list.length === 1 ? "cliente sumido" : "clientes sumidos"} há mais de ${away} dias, de ${all.length} no total.`
          : `${all.length} ${all.length === 1 ? "cliente" : "clientes"} nos últimos 2 anos.`}
        {away > 0 && optedOut > 0 && ` ${optedOut} marcado${optedOut === 1 ? "" : "s"} como "não chamar mais" não aparece${optedOut === 1 ? "" : "m"} aqui.`}
      </p>

      {list.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-6 text-sm text-neutral-500 shadow-sm">
          {all.length === 0 ? "Ainda não há clientes: eles aparecem aqui depois da primeira venda paga ou do primeiro atendimento." : "Ninguém sumido nesse período. 🎉"}
        </p>
      ) : (
        <CustomerList rows={list} storeName={store.name} canMark={!contactsError} />
      )}
    </div>
  );
}
