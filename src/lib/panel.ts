import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type Area, type MemberRole, canAccess, homeFor, isMemberRole } from "@/lib/team";

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
    .select("store_id, role, created_at, stores(id, name, slug, status, logo_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  // v1: um lojista = uma loja. Com mais de uma, usa a primeira vinculada.
  const membership = memberships?.[0] as unknown as { store_id: string; role: string; stores: PanelStore | null } | undefined;
  const role: MemberRole = isMemberRole(membership?.role) ? membership.role : "owner";

  // Cadastro da agenda ligado ao acesso do profissional (SQL 20261124000000; lido à parte para não quebrar sem ele).
  let professionalId: string | null = null;
  if (role === "professional" && membership) {
    const { data: link } = await supabase.from("store_members").select("professional_id").eq("store_id", membership.store_id).eq("user_id", userId).maybeSingle();
    professionalId = (link as { professional_id: string | null } | null)?.professional_id ?? null;
  }

  return {
    supabase,
    userId,
    email: (data.claims.email as string | undefined) ?? null,
    store: membership?.stores ?? null,
    role,
    professionalId,
  };
});

// Para páginas e actions que precisam de uma loja. Sem área, a tela é só do dono; quem não pode
// acessar volta para a tela inicial do seu perfil (nas actions, o redirect interrompe a ação).
export async function requireStore(area: Area = "dono") {
  const ctx = await getPanelContext();
  if (!ctx.store) redirect("/painel/sem-loja");
  if (!canAccess(ctx.role, area)) redirect(homeFor(ctx.role));
  return { ...ctx, store: ctx.store };
}
