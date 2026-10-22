import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Máximo de parcelas oferecido no Card Payment Brick (payment-panel.tsx).
export const MAX_INSTALLMENTS = 12;

export type InstallmentsInfo = { max: number; interestFree: number };

type PayerCost = { installments: number; installment_rate: number };

// Parcelamento que o Mercado Pago oferece para este valor, na conta da loja:
// quantas parcelas no máximo e até quantas sem juros (o lojista configura isso no MP).
// Consulta pública (só a chave pública), em cache por 6 h. Se falhar, a vitrine mostra só o padrão.
export async function getInstallmentsInfo(storeId: string, amountCents: number): Promise<InstallmentsInfo | null> {
  const { data: secret } = await createAdminClient()
    .from("store_secrets")
    .select("gateway_public_key")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!secret?.gateway_public_key) return null;

  const url = new URL("https://api.mercadopago.com/v1/payment_methods/installments");
  url.searchParams.set("public_key", secret.gateway_public_key);
  url.searchParams.set("amount", (amountCents / 100).toFixed(2));
  url.searchParams.set("payment_method_id", "visa"); // regra de juros da conta vale para as bandeiras em geral

  try {
    const res = await fetch(url, { next: { revalidate: 6 * 3600 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const methods = (await res.json()) as { payer_costs?: PayerCost[] }[];
    const costs = (methods[0]?.payer_costs ?? []).filter((c) => c.installments <= MAX_INSTALLMENTS);
    if (!costs.length) return null;
    return {
      max: Math.max(...costs.map((c) => c.installments)),
      interestFree: Math.max(1, ...costs.filter((c) => c.installment_rate === 0).map((c) => c.installments)),
    };
  } catch {
    return null;
  }
}
