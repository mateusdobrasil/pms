import { notFound, redirect } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings, loadCatalog } from "@/lib/booking-server";
import { bookingDays } from "@/lib/booking-slots";
import { canSelfManage, onlineCents } from "@/lib/booking";
import { todayBR } from "@/lib/billing";
import { isUuid } from "@/lib/validation";
import { BookingWizard } from "./booking-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agendar horário" };

export default async function BookPage({ params, searchParams }: { params: Promise<{ domain: string }>; searchParams: Promise<{ remarcar?: string; servico?: string }> }) {
  const { domain } = await params;
  const { remarcar, servico } = await searchParams;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const db = createAdminClient();
  const settings = await getBookingSettings(db, store.id);
  if (!settings?.enabled) notFound();
  const { services, professionals } = await loadCatalog(db, store.id);

  // Remarcação pelo link do agendamento: mesmo serviço, dentro do prazo da loja.
  let reschedule: { token: string; serviceId: string; professionalId: string | null } | null = null;
  if (remarcar && isUuid(remarcar)) {
    const { data: b } = await db.from("bookings").select("status, service_id, professional_id, starts_at").eq("store_id", store.id).eq("public_token", remarcar).maybeSingle();
    if (!b || b.status !== "confirmed" || !b.service_id || !canSelfManage(b.starts_at, settings.cancelHours) || !services.some((s) => s.id === b.service_id)) {
      redirect(`/agendamento/${remarcar}`);
    }
    reschedule = { token: remarcar, serviceId: b.service_id, professionalId: b.professional_id };
  }
  const shown = reschedule ? services.filter((s) => s.id === reschedule.serviceId) : services;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{reschedule ? "Remarcar horário" : "Agendar horário"}</h1>
        <p className="text-neutral-600">{reschedule ? "Escolha o novo dia e horário. O que você já pagou continua valendo." : "Escolha o serviço, o profissional e o melhor horário para você."}</p>
      </header>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-8 text-center text-neutral-600">Nenhum serviço disponível para agendar no momento.</p>
      ) : (
        <BookingWizard
          reschedule={reschedule}
          initialServiceId={servico && shown.some((s) => s.id === servico) ? servico : null}
          services={shown.map((s) => ({ ...s, online_cents: onlineCents(s.price_cents, s.payment_mode, s.deposit_percent) }))}
          professionals={professionals.map((p) => ({ id: p.id, name: p.name, serviceIds: p.serviceIds, weekdays: p.weekdays }))}
          days={bookingDays(todayBR(), settings.maxDays)}
          whatsapp={store.whatsapp}
        />
      )}
    </div>
  );
}
