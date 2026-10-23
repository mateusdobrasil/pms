import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { availability, getBookingSettings } from "@/lib/booking-server";
import { formatTime } from "@/lib/booking";

// Horários livres de um serviço num dia: /api/bookings/slots?service=<id>&date=AAAA-MM-DD[&professional=<id>]
export async function GET(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("service") ?? "";
  const professionalId = url.searchParams.get("professional") || null;
  const date = url.searchParams.get("date") ?? "";
  if (!isUuid(serviceId) || (professionalId && !isUuid(professionalId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const db = createAdminClient();
  const settings = await getBookingSettings(db, store.id);
  if (!settings?.enabled) return NextResponse.json({ error: "Agendamentos indisponíveis" }, { status: 404 });
  const { slots } = await availability(db, store.id, settings, serviceId, date, professionalId);
  return NextResponse.json(
    { slots: slots.map((s) => ({ time: s.time, label: formatTime(s.time) })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
