"use server";

import { createClient } from "@supabase/supabase-js";
import { getPanelContext } from "@/lib/panel";

export type PasswordState = { error?: string; ok?: string } | null;

export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const { supabase, email } = await getPanelContext();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!email) return { error: "Sessão inválida. Entre de novo." };
  if (next.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (next !== confirm) return { error: "A confirmação não confere com a nova senha." };
  if (next === current) return { error: "A nova senha precisa ser diferente da atual." };

  // Confere a senha atual num cliente separado, sem mexer nos cookies da sessão.
  // Não chamar signOut() nele: o padrão é global e derrubaria a sessão do próprio lojista.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await check.auth.signInWithPassword({ email, password: current });
  if (wrong) return { error: "Senha atual incorreta." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("Erro ao trocar senha", error.code, error.message);
    return { error: error.code === "weak_password" ? "Senha fraca: use letras e números." : "Não foi possível trocar a senha." };
  }
  return { ok: "Senha alterada." };
}
