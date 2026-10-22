import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const ADMIN_2FA_PATH = "/admin-verificacao";

// Super-admin = usuário presente em platform_admins (tabela sem policy: só a service role lê).
// Devolve null para quem não está logado ou não é admin; "aal2" = já confirmou o código do autenticador.
export const getAdminSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { status: "anonymous" as const };

  const db = createAdminClient();
  const { data: admin } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) return { status: "not-admin" as const };

  return {
    status: "admin" as const,
    supabase,
    db,
    userId,
    email: (data.claims.email as string | undefined) ?? null,
    verified: data.claims.aal === "aal2",
  };
});

// Páginas e ações do /admin. Quem não é admin recebe 404, para não revelar que a área existe.
// Verificação em duas etapas obrigatória: sem o código do autenticador nesta sessão, vai para a tela do código.
export const requireAdmin = cache(async () => {
  const session = await getAdminSession();
  if (session.status === "anonymous") redirect("/painel/login");
  if (session.status === "not-admin") notFound();
  if (!session.verified) redirect(ADMIN_2FA_PATH);
  return { db: session.db, userId: session.userId, email: session.email };
});

const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "localhost")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// "https://www.Loja.com.br/x" → "www.loja.com.br". Retorna null se não for um domínio válido de loja.
export function normalizeDomain(input: string) {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host)) return null;
  // Domínios da plataforma não podem virar loja.
  const isRoot = ROOT_DOMAINS.some((r) => (r.startsWith("*.") ? host.endsWith(r.slice(1)) : host === r || host === `www.${r}`));
  if (isRoot || host.endsWith(".vercel.app")) return null;
  return host;
}
