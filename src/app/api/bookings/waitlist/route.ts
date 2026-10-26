import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { joinWaitlist } from "@/lib/booking-server";
import { TEST_ACCESS_COOKIE, isValidTestAccess, storeTestMode } from "@/lib/test-mode";

// Dia lotado: entra na lista de espera (o aviso chega por e-mail quando abrir horário).
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const limited = await rateLimit(req, store.id, "booking");
  if (limited) return limited;

  if ((await storeTestMode(store.id)) && !isValidTestAccess(store.id, (await cookies()).get(TEST_ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ error: "Esta loja ainda está em preparação e não aceita agendamentos. Volte em breve!" }, { status: 403 });
  }

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const serviceId = String(b.serviceId ?? "");
  const professionalId = b.professionalId ? String(b.professionalId) : null;
  const date = String(b.date ?? "");
  if (!isUuid(serviceId) || (professionalId && !isUuid(professionalId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Escolha o serviço e o dia." }, { status: 400 });
  }
  const result = await joinWaitlist(createAdminClient(), store.id, {
    serviceId,
    professionalId,
    date,
    name: String(b.name ?? ""),
    email: String(b.email ?? ""),
    phone: String(b.phone ?? ""),
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
