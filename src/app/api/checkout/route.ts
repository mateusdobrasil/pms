import { NextResponse, after } from "next/server";
import { notifyPlatformError } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { createOrder } from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { TEST_ACCESS_COOKIE, isValidTestAccess, storeTestMode } from "@/lib/test-mode";

// Cria o pedido (aguardando pagamento). O pagamento é feito depois em /pedido/<token>.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const limited = await rateLimit(req, store.id, "checkout");
  if (limited) return limited;

  // Loja em modo de teste: só quem abriu o link de acesso consegue criar pedido (pagamento é simulado).
  if ((await storeTestMode(store.id)) && !isValidTestAccess(store.id, (await cookies()).get(TEST_ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ errors: ["Esta loja ainda está em preparação e não aceita pedidos. Volte em breve!"] }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  let result: Awaited<ReturnType<typeof createOrder>>;
  try {
    result = await createOrder(createAdminClient(), store, body);
  } catch (err) {
    console.error("Erro ao criar pedido", { storeId: store.id, err });
    after(() => notifyPlatformError(`pedido:${store.id}`, `Falha ao criar pedido (${store.name})`, { loja: store.name, erro: err instanceof Error ? err.message : JSON.stringify(err) }));
    return NextResponse.json({ errors: ["Não foi possível criar o pedido agora. Tente de novo em instantes."] }, { status: 500 });
  }
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

  return NextResponse.json({ token: result.token }, { status: 201 });
}
