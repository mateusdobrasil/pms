import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { notifyPlatformError } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { createLinkOrder } from "@/lib/payment-links-server";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { TEST_ACCESS_COOKIE, isValidTestAccess, storeTestMode } from "@/lib/test-mode";

// Link de pagamento: com os dados do cliente, cria o pedido. O pagamento segue em /pedido/<token>, como no checkout.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return NextResponse.json({ errors: ["Link de pagamento não encontrado."] }, { status: 404 });

  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ errors: ["Loja não encontrada"] }, { status: 404 });

  const limited = await rateLimit(req, store.id, "checkout");
  if (limited) return limited;

  // Loja em modo de teste: só quem abriu o link de acesso consegue pagar (pagamento é simulado).
  if ((await storeTestMode(store.id)) && !isValidTestAccess(store.id, (await cookies()).get(TEST_ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ errors: ["Esta loja ainda está em preparação e não aceita pagamentos. Volte em breve!"] }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  try {
    const result = await createLinkOrder(createAdminClient(), store.id, token, body);
    if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: result.status ?? 400 });
    return NextResponse.json({ token: result.token }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar pedido do link", { storeId: store.id, err });
    after(() => notifyPlatformError(`link:${store.id}`, `Falha ao criar pedido do link de pagamento (${store.name})`, { loja: store.name, erro: err instanceof Error ? err.message : JSON.stringify(err) }));
    return NextResponse.json({ errors: ["Não foi possível continuar agora. Tente de novo em instantes."] }, { status: 500 });
  }
}
