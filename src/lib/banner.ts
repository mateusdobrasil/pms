import { createPublicClient } from "@/lib/supabase/public";

export type Banner = {
  image_url: string | null;
  title: string | null;
  subtitle: string | null;
  link: string | null;
};

// Banner da home. Consulta separada da loja: se as colunas ainda não existirem no banco
// (SQL 20261022000000 não rodado), a vitrine segue com o cabeçalho padrão em vez de quebrar.
export async function getBanner(storeId: string): Promise<Banner | null> {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("banner_image_url, banner_title, banner_subtitle, banner_link")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.banner_image_url && !data.banner_title) return null;
  return {
    image_url: data.banner_image_url,
    title: data.banner_title,
    subtitle: data.banner_subtitle,
    link: data.banner_link,
  };
}

// Link do banner: caminho dentro da loja ("/c/promocoes") ou endereço https.
export function isValidBannerLink(link: string) {
  if (link.startsWith("/")) return !link.startsWith("//") && link.length <= 200;
  try {
    return new URL(link).protocol === "https:" && link.length <= 500;
  } catch {
    return false;
  }
}
