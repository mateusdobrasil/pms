import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings, loadCatalog } from "@/lib/booking-server";
import { bookingDays } from "@/lib/booking-slots";
import { onlineCents } from "@/lib/booking";
import { todayBR } from "@/lib/billing";
import { BookingWizard } from "./booking-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agendar horário" };

export default async function BookPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const db = createAdminClient();
  const settings = await getBookingSettings(db, store.id);
  if (!settings?.enabled) notFound();
  const { services, professionals } = await loadCatalog(db, store.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Agendar horário</h1>
        <p className="text-neutral-600">Escolha o serviço, o profissional e o melhor horário para você.</p>
      </header>
      {services.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-8 text-center text-neutral-600">Nenhum serviço disponível para agendar no momento.</p>
      ) : (
        <BookingWizard
          services={services.map((s) => ({ ...s, online_cents: onlineCents(s.price_cents, s.payment_mode, s.deposit_percent) }))}
          professionals={professionals.map((p) => ({ id: p.id, name: p.name, serviceIds: p.serviceIds, weekdays: p.weekdays }))}
          days={bookingDays(todayBR(), settings.maxDays)}
          whatsapp={store.whatsapp}
        />
      )}
    </div>
  );
}
