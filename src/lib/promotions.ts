import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type Promotions = {
  pixDiscountPercent: number; // 0 = sem desconto
  freeShippingMinCents: number | null; // nulo = sem frete grátis
};

const NONE: Promotions = { pixDiscountPercent: 0, freeShippingMinCents: null };

// Promoções da loja. Consulta separada de getStoreByDomain: se as colunas não existirem
// (SQL 20261022200000 não rodado), a loja segue sem promoções em vez de quebrar.
export const getPromotions = cache(async (storeId: string): Promise<Promotions> => {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("pix_discount_percent, free_shipping_min_cents")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return NONE;
  return {
    pixDiscountPercent: data.pix_discount_percent ?? 0,
    freeShippingMinCents: data.free_shipping_min_cents ?? null,
  };
});

// Desconto do Pix sobre os produtos (o frete não tem desconto), em centavos inteiros.
export function pixDiscountCents(subtotalCents: number, percent: number) {
  return percent > 0 ? Math.floor((subtotalCents * percent) / 100) : 0;
}
