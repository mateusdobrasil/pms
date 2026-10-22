import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/urls";

// Loja em modo de teste: Mercado Pago com credencial TEST- (ou ainda sem credencial).
// Nesse modo a vitrine avisa "Loja em preparação" e a criação de pedido é recusada, para um cliente real
// não "comprar" com pagamento simulado. Quem precisa testar abre o link de acesso (testAccessUrl),
// que grava o cookie TEST_ACCESS_COOKIE no domínio da loja e libera as compras de teste naquele navegador.

export const TEST_ACCESS_COOKIE = "acesso-teste";
export const TEST_ACCESS_PATH = "/acesso-teste";

export const isTestToken = (token: string | null | undefined) => !token || token.startsWith("TEST-");

export const storeTestMode = cache(async (storeId: string) => {
  const { data } = await createAdminClient().from("store_secrets").select("gateway_access_token").eq("store_id", storeId).maybeSingle();
  return isTestToken(data?.gateway_access_token);
});

// Código do link de acesso: HMAC do id da loja com um segredo do servidor (não dá para adivinhar nem reaproveitar em outra loja).
export function testAccessCode(storeId: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") {
  return createHmac("sha256", secret).update(`acesso-teste:${storeId}`).digest("base64url").slice(0, 32);
}

export function isValidTestAccess(storeId: string, code: string | null | undefined) {
  if (!code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(testAccessCode(storeId));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function testAccessUrl(domain: string, storeId: string) {
  return `${storeBaseUrl(domain)}${TEST_ACCESS_PATH}?c=${testAccessCode(storeId)}`;
}
