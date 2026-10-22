import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type StoreMarketing = {
  instagram: string | null; // nome de usuário, sem @
  metaPixelId: string | null;
  gaMeasurementId: string | null; // G-XXXXXXX
};

const NONE: StoreMarketing = { instagram: null, metaPixelId: null, gaMeasurementId: null };

// Instagram e rastreamento da loja. Consulta separada de getStoreByDomain: sem as colunas
// (SQL 20261023000000 não rodado), a vitrine segue sem esses recursos em vez de quebrar.
export const getStoreMarketing = cache(async (storeId: string): Promise<StoreMarketing> => {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("instagram, meta_pixel_id, ga_measurement_id")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return NONE;
  return { instagram: data.instagram, metaPixelId: data.meta_pixel_id, gaMeasurementId: data.ga_measurement_id };
});

// Aceita "@loja", "loja" ou o link do perfil; devolve só o nome de usuário (ou null se inválido).
export function parseInstagramHandle(input: string): string | null {
  const s = input.trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : null;
}
