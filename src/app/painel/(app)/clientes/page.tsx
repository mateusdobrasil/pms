import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { storeBaseUrl } from "@/lib/urls";
import { AWAY_DAYS, daysSince } from "@/lib/customers";
import { loadStoreCustomers } from "@/lib/customers-server";
import { type LoyaltyConfig, type LoyaltyCounts, loyaltyProgress } from "@/lib/loyalty";
import { CustomerList, type CustomerRow } from "./customer-list";
import { LoyaltyCard } from "./loyalty-card";

export const metadata = { title: "Clientes · PMS app" };

const MAX_ROWS = 300;

type ContactRow = { customer_key: string; contacted_at: string | null; do_not_contact: boolean };
type LoyaltyRow = { loyalty_enabled: boolean; loyalty_goal: number; loyalty_reward: string | null; loyalty_counts: LoyaltyCounts; loyalty_min_order_cents: number; loyalty_started_at: string | null };

// "sáb., 31/10 às 14:00"
const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
};

// Clientes que sumiram (quem não volta há um tempo, com atalho para o WhatsApp) e o cartão fidelidade.
// ?dias=30|60|90|180 (sumidos), ?dias=fidelidade (cartões e prêmios) ou ?dias=todos.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { supabase, store } = await requireStore();
  const sp = await searchParams;
  const loyaltyTab = sp.dias === "fidelidade";
  const away = loyaltyTab || sp.dias === "todos" ? 0 : (AWAY_DAYS as readonly number[]).includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const now = new Date();

  // Cartão fidelidade: colunas do SQL 20261113000000, lidas à parte (sem elas, a seção não aparece).
  const { data: lr, error: loyaltyError } = await supabase
    .from("stores")
    .select("loyalty_enabled, loyalty_goal, loyalty_reward, loyalty_counts, loyalty_min_order_cents, loyalty_started_at")
    .eq("id", store.id)
    .maybeSingle();
  const raw = lr as LoyaltyRow | null;
  const loyalty: (LoyaltyConfig & { rawEnabled: boolean }) | null =
    loyaltyError || !raw
      ? null
      : {
          enabled: raw.loyalty_enabled && !!raw.loyalty_reward,
          rawEnabled: raw.loyalty_enabled,
          goal: raw.loyalty_goal,
          reward: raw.loyalty_reward ?? "",
          counts: raw.loyalty_counts,
          minOrderCents: raw.loyalty_min_order_cents,
          startedAt: raw.loyalty_started_at,
        };

  const [customers, { data: contacts, error: contactsError }, { data: domains }, { data: bookingRow }, { data: rewards }] = await Promise.all([
    loadStoreCustomers(supabase, store.id, now, loyalty?.enabled ? loyalty : null),
    supabase.from("customer_contacts").select("customer_key, contacted_at, do_not_contact").eq("store_id", store.id),
    supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id),
    supabase.from("stores").select("booking_enabled").eq("id", store.id).maybeSingle(),
    loyalty ? supabase.from("loyalty_rewards").select("customer_key").eq("store_id", store.id).is("redeemed_at", null) : Promise.resolve({ data: [] }),
  ]);
  const marks = new Map(((contacts ?? []) as ContactRow[]).map((c) => [c.customer_key, c]));
  const openRewards = new Map<string, number>();
  for (const r of (rewards ?? []) as { customer_key: string }[]) openRewards.set(r.customer_key, (openRewards.get(r.customer_key) ?? 0) + 1);

  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
  const base = domain ? storeBaseUrl(domain) : "";
  const agendaOn = !!(bookingRow as { booking_enabled?: boolean } | null)?.booking_enabled;

  const all: CustomerRow[] = customers.map((c) => {
    const mark = marks.get(c.key);
    // Prêmio guardado pelo celular ou pelo e-mail (o mesmo cliente pode ter as duas chaves).
    const prizes = (c.phone ? (openRewards.get(c.phone) ?? 0) : 0) + (c.email && c.email !== c.phone ? (openRewards.get(c.email) ?? 0) : 0);
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
      loyalty: loyalty?.enabled && (c.stamps > 0 || prizes > 0) ? { current: loyaltyProgress(c.stamps, loyalty.goal).current, goal: loyalty.goal, prizes, keys: [c.phone, c.email].filter(Boolean) as string[] } : null,
    };
  });

  // Sumidos: sem horário marcado, há mais de N dias, e não marcados como "não chamar mais".
  // Ordem: quem você ainda não chamou (ou chamou há mais de 30 dias) primeiro, e os que mais gastaram no topo.
  // Fidelidade: quem tem prêmio para receber primeiro, depois quem está mais perto de completar.
  const fresh = (c: CustomerRow) => c.contactedDays == null || c.contactedDays > 30;
  const list = (
    loyaltyTab
      ? all.filter((c) => c.loyalty).sort((a, b) => b.loyalty!.prizes - a.loyalty!.prizes || b.loyalty!.current - a.loyalty!.current)
      : all
          .filter((c) => (away ? c.daysAway >= away && !c.nextBooking && !c.doNotContact : true))
          .sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || b.totalCents - a.totalCents)
  ).slice(0, MAX_ROWS);
  const optedOut = all.filter((c) => c.doNotContact).length;
  const prizesOpen = all.reduce((s, c) => s + (c.loyalty?.prizes ?? 0), 0);

  const tab = (value: string, label: string) => {
    const active = value === "fidelidade" ? loyaltyTab : value === "todos" ? away === 0 && !loyaltyTab : Number(value) === away;
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

      {loyalty && (
        <LoyaltyCard
          config={loyalty}
          agenda={agendaOn}
          startedLabel={loyalty.startedAt ? new Date(loyalty.startedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null}
        />
      )}

      <div className="flex gap-2 overflow-x-auto">
        {AWAY_DAYS.map((d) => tab(String(d), `Sumidos há ${d}+ dias`))}
        {loyalty?.enabled && tab("fidelidade", prizesOpen ? `Fidelidade · 🎁 ${prizesOpen}` : "Fidelidade")}
        {tab("todos", "Todos os clientes")}
      </div>

      <p className="text-sm text-neutral-600">
        {loyaltyTab
          ? `${list.length} ${list.length === 1 ? "cliente" : "clientes"} com carimbos${prizesOpen ? `, ${prizesOpen} ${prizesOpen === 1 ? "prêmio" : "prêmios"} para entregar` : ""}.`
          : away
            ? `${list.length} ${list.length === 1 ? "cliente sumido" : "clientes sumidos"} há mais de ${away} dias, de ${all.length} no total.`
            : `${all.length} ${all.length === 1 ? "cliente" : "clientes"} nos últimos 2 anos.`}
        {away > 0 && optedOut > 0 && ` ${optedOut} marcado${optedOut === 1 ? "" : "s"} como "não chamar mais" não aparece${optedOut === 1 ? "" : "m"} aqui.`}
      </p>

      {list.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-6 text-sm text-neutral-500 shadow-sm">
          {loyaltyTab
            ? "Ninguém com carimbos ainda: eles aparecem a partir da primeira compra ou atendimento depois de ligar o cartão."
            : all.length === 0
              ? "Ainda não há clientes: eles aparecem aqui depois da primeira venda paga ou do primeiro atendimento."
              : "Ninguém sumido nesse período. 🎉"}
        </p>
      ) : (
        <CustomerList rows={list} storeName={store.name} canMark={!contactsError} />
      )}
    </div>
  );
}
