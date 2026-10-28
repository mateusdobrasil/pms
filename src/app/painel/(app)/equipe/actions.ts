"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTeamRole, ROLE_LABELS, type TeamRole } from "@/lib/team";
import { findUserByEmail, tempPassword } from "@/lib/users-server";
import { isEmail, isUuid } from "@/lib/validation";

// Equipe da loja: só o dono (requireStore sem área). Acessos e senhas mexem no Auth, por isso tudo com a
// service role, sempre preso à loja do dono e nunca tocando em outro dono.

export type TeamState = { error?: string; ok?: string; password?: string; email?: string } | null;

const MAX_TEAM = 20;
const refresh = () => revalidatePath("/painel/equipe");

// Perfil e profissional vindos do formulário. Profissional precisa de um cadastro ativo da agenda desta loja.
async function readRole(db: ReturnType<typeof createAdminClient>, storeId: string, form: FormData) {
  const role = String(form.get("role") ?? "");
  if (!isTeamRole(role)) return { error: "Escolha o perfil." } as const;
  if (role === "staff") return { role, professionalId: null } as const;
  const professionalId = String(form.get("professionalId") ?? "");
  if (!isUuid(professionalId)) return { error: "Escolha qual profissional da agenda é esta pessoa." } as const;
  const { data } = await db.from("professionals").select("id").eq("id", professionalId).eq("store_id", storeId).eq("active", true).maybeSingle();
  if (!data) return { error: "Profissional não encontrado." } as const;
  return { role: role as TeamRole, professionalId } as const;
}

// Pessoa da equipe desta loja (nunca o dono).
async function teamMember(db: ReturnType<typeof createAdminClient>, storeId: string, userId: string) {
  if (!isUuid(userId)) return null;
  const { data } = await db.from("store_members").select("user_id, role").eq("store_id", storeId).eq("user_id", userId).maybeSingle();
  return data && isTeamRole(data.role) ? data : null;
}

export async function addTeamMember(_prev: TeamState, form: FormData): Promise<TeamState> {
  const { store } = await requireStore();
  const db = createAdminClient();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { error: "E-mail inválido." };
  const picked = await readRole(db, store.id, form);
  if ("error" in picked) return { error: picked.error };

  const { count } = await db.from("store_members").select("user_id", { count: "exact", head: true }).eq("store_id", store.id);
  if ((count ?? 0) >= MAX_TEAM) return { error: `A loja já tem ${MAX_TEAM} acessos. Remova alguém antes de adicionar.` };

  try {
    // E-mail que já existe: só serve se não tiver acesso a nenhuma loja (ex.: removido antes). Ganha senha nova.
    const found = await findUserByEmail(db, email);
    let userId: string;
    const password = tempPassword();
    if (found) {
      const [{ data: links }, { data: admin }] = await Promise.all([
        db.from("store_members").select("store_id").eq("user_id", found.id),
        db.from("platform_admins").select("user_id").eq("user_id", found.id).maybeSingle(),
      ]);
      if (links?.some((l) => l.store_id === store.id)) return { error: "Este e-mail já faz parte da equipe." };
      if (links?.length || admin) return { error: "Este e-mail já é usado em outra conta da PMS app. Use outro e-mail." };
      const { error } = await db.auth.admin.updateUserById(found.id, { password });
      if (error) throw error;
      userId = found.id;
    } else {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error } = await db
      .from("store_members")
      .insert({ store_id: store.id, user_id: userId, role: picked.role, professional_id: picked.professionalId });
    if (error?.code === "23505") return { error: "Esse profissional já tem um acesso. Remova o outro antes." };
    if (error) throw error;
    refresh();
    return { ok: `${email} entrou na equipe como ${ROLE_LABELS[picked.role]}.`, password, email };
  } catch (err) {
    console.error("Equipe: acesso não criado", { storeId: store.id, err });
    return { error: "Não foi possível criar o acesso. Tente de novo." };
  }
}

export async function updateTeamMember(_prev: TeamState, form: FormData): Promise<TeamState> {
  const { store } = await requireStore();
  const db = createAdminClient();
  const member = await teamMember(db, store.id, String(form.get("userId") ?? ""));
  if (!member) return { error: "Pessoa não encontrada." };
  const picked = await readRole(db, store.id, form);
  if ("error" in picked) return { error: picked.error };
  const { error } = await db
    .from("store_members")
    .update({ role: picked.role, professional_id: picked.professionalId })
    .eq("store_id", store.id)
    .eq("user_id", member.user_id);
  if (error?.code === "23505") return { error: "Esse profissional já tem um acesso. Remova o outro antes." };
  if (error) return { error: "Não foi possível salvar." };
  refresh();
  return { ok: "Acesso atualizado." };
}

// Esqueceu a senha: nova senha temporária, mostrada uma vez ao dono. Só para quem não tem outra conta na plataforma.
export async function resetTeamPassword(_prev: TeamState, form: FormData): Promise<TeamState> {
  const { store } = await requireStore();
  const db = createAdminClient();
  const member = await teamMember(db, store.id, String(form.get("userId") ?? ""));
  if (!member) return { error: "Pessoa não encontrada." };
  const { count } = await db.from("store_members").select("store_id", { count: "exact", head: true }).eq("user_id", member.user_id);
  if ((count ?? 0) > 1) return { error: "Este acesso também é usado em outra loja. Peça para a pessoa trocar a senha em Minha conta." };
  const password = tempPassword();
  const { data, error } = await db.auth.admin.updateUserById(member.user_id, { password });
  if (error) return { error: "Não foi possível gerar a senha." };
  return { ok: "Senha nova gerada.", password, email: data.user.email ?? undefined };
}

export async function removeTeamMember(form: FormData) {
  const { store } = await requireStore();
  const db = createAdminClient();
  const member = await teamMember(db, store.id, String(form.get("userId") ?? ""));
  if (!member) return;
  await db.from("store_members").delete().eq("store_id", store.id).eq("user_id", member.user_id).in("role", ["staff", "professional"]);
  refresh();
}
