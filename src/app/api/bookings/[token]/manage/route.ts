import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { cancelBooking, rescheduleBooking } from "@/lib/booking-server";

// Autoatendimento pelo link do agendamento: { action: "cancel" } ou { action: "reschedule", date, time, professionalId }.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const limited = await rateLimit(req, store.id, "booking");
  if (limited) return limited;

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const db = createAdminClient();
  if (b.action === "cancel") {
    const r = await cancelBooking(db, store.id, token, "customer");
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ ok: true });
  }
  if (b.action === "reschedule") {
    const date = String(b.date ?? "");
    const time = Number(b.time);
    const professionalId = b.professionalId ? String(b.professionalId) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(time) || (professionalId && !isUuid(professionalId))) {
      return NextResponse.json({ error: "Escolha o dia e o horário." }, { status: 400 });
    }
    const r = await rescheduleBooking(db, store.id, token, { date, time, professionalId });
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
