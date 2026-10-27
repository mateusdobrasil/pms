import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Limites por IP e por loja (janela fixa). Valores pensados para um cliente real nunca bater.
const LIMITS = {
  checkout: { limit: 10, windowSeconds: 10 * 60 }, // pedidos criados
  lookup: { limit: 15, windowSeconds: 15 * 60 }, // buscas em "Meus pedidos"
  pay: { limit: 12, windowSeconds: 10 * 60 }, // tentativas de pagamento (barra teste de cartões roubados)
  stockAlert: { limit: 10, windowSeconds: 10 * 60 }, // pedidos de "avise-me quando chegar"
  booking: { limit: 10, windowSeconds: 10 * 60 }, // agendamentos criados
  coupon: { limit: 20, windowSeconds: 10 * 60 }, // cupons conferidos no checkout (barra quem tenta adivinhar)
} as const;

export type RateLimitAction = keyof typeof LIMITS;

function clientIp(req: Request) {
  // Na Vercel, o primeiro IP do x-forwarded-for é o do cliente.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

// Devolve uma resposta 429 se passou do limite; null para seguir.
// Se o banco falhar (ou o SQL ainda não foi rodado), deixa passar: o limite não pode derrubar a venda.
export async function rateLimit(req: Request, storeId: string, action: RateLimitAction) {
  const { limit, windowSeconds } = LIMITS[action];
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_store_id: storeId,
    p_key: `${action}:${clientIp(req)}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate_limit_hit falhou; seguindo sem limite", error.message);
    return null;
  }
  if (data !== false) return null;
  const minutes = Math.round(windowSeconds / 60);
  const message = `Muitas tentativas seguidas. Aguarde ${minutes} minutos e tente de novo.`;
  return NextResponse.json({ error: message, errors: [message] }, { status: 429 });
}
