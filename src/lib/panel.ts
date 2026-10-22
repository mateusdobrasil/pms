import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PanelStore = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  logo_url: string | null;
};

// Sessão do lojista + loja dele. Redireciona para o login se não houver sessão válida.
// getClaims() valida o JWT; nunca confie só no cookie (getSession).
export const getPanelContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/painel/login");

  const { data: memberships } = await supabase
    .from("store_members")
    .select("role, created_at, stores(id, name, slug, status, logo_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  // v1: um lojista = uma loja. Com mais de uma, usa a primeira vinculada.
  const membership = memberships?.[0] as unknown as { role: string; stores: PanelStore | null } | undefined;

  return {
    supabase,
    userId,
    email: (data.claims.email as string | undefined) ?? null,
    store: membership?.stores ?? null,
  };
});

// Para páginas e actions que precisam de uma loja.
export async function requireStore() {
  const ctx = await getPanelContext();
  if (!ctx.store) redirect("/painel/sem-loja");
  return { ...ctx, store: ctx.store };
}
