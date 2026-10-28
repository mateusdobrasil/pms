import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Usuários do Supabase Auth (service role). Usado pelo /admin e pela tela Equipe do painel.

export const tempPassword = () => randomBytes(9).toString("base64url"); // 12 caracteres

// O Auth não busca por e-mail: percorre as páginas (até 4.000 usuários).
export async function findUserByEmail(db: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}
