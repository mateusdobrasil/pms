import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { createBooking } from "@/lib/booking-server";
import { TEST_ACCESS_COOKIE, isValidTestAccess, storeTestMode } from "@/lib/test-mode";

// Cria o agendamento (o servidor recalcula a disponibilidade; o navegador só sugere o horário).
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const limited = await rateLimit(req, store.id, "booking");
  if (limited) return limited;

  // Loja em modo de teste: só quem abriu o link de acesso agenda (como no checkout).
  if ((await storeTestMode(store.id)) && !isValidTestAccess(store.id, (await cookies()).get(TEST_ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ error: "Esta loja ainda está em preparação e não aceita agendamentos. Volte em breve!" }, { status: 403 });
  }

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const serviceId = String(b.serviceId ?? "");
  const professionalId = b.professionalId ? String(b.professionalId) : null;
  const date = String(b.date ?? "");
  const time = Number(b.time);
  if (!isUuid(serviceId) || (professionalId && !isUuid(professionalId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(time)) {
    return NextResponse.json({ error: "Escolha o serviço, o dia e o horário." }, { status: 400 });
  }

  const result = await createBooking(createAdminClient(), store.id, {
    serviceId,
    professionalId,
    date,
    time,
    name: String(b.name ?? ""),
    email: String(b.email ?? ""),
    phone: String(b.phone ?? ""),
    cpf: String(b.cpf ?? ""),
    notes: String(b.notes ?? ""),
    whatsappOptIn: b.whatsappOptIn === true,
    coupon: typeof b.coupon === "string" && b.coupon.trim() ? b.coupon : null,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ token: result.token }, { status: 201 });
}
