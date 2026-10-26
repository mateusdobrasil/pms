import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type StoreMarketing = {
  instagram: string | null; // nome de usuário, sem @
  metaPixelId: string | null;
  gaMeasurementId: string | null; // G-XXXXXXX
  googleSiteVerification: string | null;
  metaDomainVerification: string | null; // catálogo do Instagram/Facebook
};

const NONE: StoreMarketing = { instagram: null, metaPixelId: null, gaMeasurementId: null, googleSiteVerification: null, metaDomainVerification: null };

// Instagram e rastreamento da loja. Consulta separada de getStoreByDomain: sem as colunas
// (SQL 20261023000000 não rodado), a vitrine segue sem esses recursos em vez de quebrar.
export const getStoreMarketing = cache(async (storeId: string): Promise<StoreMarketing> => {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("instagram, meta_pixel_id, ga_measurement_id")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return NONE;
  // Código de verificação do Google: coluna mais nova (SQL 20261023200000), lida à parte.
  const { data: g } = await createPublicClient().from("stores").select("google_site_verification").eq("id", storeId).maybeSingle();
  // Verificação de domínio da Meta: ainda mais nova (SQL 20261105000000).
  const { data: m } = await createPublicClient().from("stores").select("meta_domain_verification").eq("id", storeId).maybeSingle();
  return {
    instagram: data.instagram,
    metaPixelId: data.meta_pixel_id,
    gaMeasurementId: data.ga_measurement_id,
    googleSiteVerification: (g as { google_site_verification: string | null } | null)?.google_site_verification ?? null,
    metaDomainVerification: (m as { meta_domain_verification: string | null } | null)?.meta_domain_verification ?? null,
  };
});

// Aceita o código sozinho ou a etiqueta inteira que o Google ou a Meta mostram
// (<meta name="google-site-verification" content="..."> / <meta name="facebook-domain-verification" content="...">).
export function parseVerificationCode(input: string): string | null {
  const s = input.trim();
  const fromTag = /content=["']([^"']+)["']/i.exec(s)?.[1] ?? s;
  return /^[A-Za-z0-9_-]{10,100}$/.test(fromTag) ? fromTag : null;
}

// Aceita "@loja", "loja" ou o link do perfil; devolve só o nome de usuário (ou null se inválido).
export function parseInstagramHandle(input: string): string | null {
  const s = input.trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : null;
}
