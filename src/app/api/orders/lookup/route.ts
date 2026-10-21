import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isEmail, onlyDigits } from "@/lib/validation";

const MAX_RESULTS = 20;

// "Meus pedidos": o cliente informa o número do pedido OU o CPF, sempre junto com o e-mail da compra.
// Exigir os dois evita que quem só sabe o CPF de alguém veja os pedidos (e o link de acompanhamento) dela.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { identifier?: unknown; email?: unknown } | null;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  const cpf = onlyDigits(identifier);
  const code = identifier.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const byCpf = cpf.length === 11 && cpf === identifier.replace(/[.\-\s]/g, "");
  if (!isEmail(email) || (!byCpf && code.length !== 8)) {
    return NextResponse.json(
      { error: "Informe o número do pedido (8 caracteres) ou o CPF, e o e-mail usado na compra." },
      { status: 400 },
    );
  }

  let query = createAdminClient()
    .from("orders")
    .select("code, public_token, status, shipping_method, total_cents, created_at")
    .eq("store_id", store.id)
    .eq("customer_email", email)
    .neq("status", "expired")
    // Pix vencido que ainda não foi marcado como expirado também fica de fora.
    .or(`status.neq.pending_payment,expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(MAX_RESULTS);
  query = byCpf ? query.eq("customer_cpf", cpf) : query.eq("code", code);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível buscar agora. Tente novamente." }, { status: 500 });

  return NextResponse.json({
    orders: (data ?? []).map((o) => ({
      code: o.code,
      token: o.public_token,
      status: o.status,
      shippingMethod: o.shipping_method,
      totalCents: o.total_cents,
      createdAt: o.created_at,
    })),
  });
}
