import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type Store = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  whatsapp: string | null;
  email: string | null;
};

// Resolve a loja pelo domínio. cache() evita consultas repetidas no mesmo request.
export const getStoreByDomain = cache(async (domain: string): Promise<Store | null> => {
  const supabase = createPublicClient();
  const host = decodeURIComponent(domain).toLowerCase();

  const { data: d } = await supabase
    .from("store_domains")
    .select("store_id")
    .eq("domain", host)
    .maybeSingle();
  if (!d) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("id, slug, name, logo_url, primary_color, whatsapp, email")
    .eq("id", d.store_id)
    .eq("status", "active")
    .maybeSingle();

  return (store as Store | null) ?? null;
});

export function productImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
