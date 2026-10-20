"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeDomain, requireAdmin } from "@/lib/admin";
import { slugify } from "@/lib/slug";
import { isEmail, isUuid, onlyDigits } from "@/lib/validation";

// Tudo aqui usa a service role (createAdminClient), sempre depois de requireAdmin().

export type AdminState = { error?: string; ok?: string; password?: string } | null;

type Db = Awaited<ReturnType<typeof requireAdmin>>["db"];

// Acha o usuário pelo e-mail ou cria um com senha temporária (mostrada uma única vez ao admin).
async function findOrCreateUser(db: Db, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return { userId: found.id, password: null as string | null };
    if (data.users.length < 200) break;
  }
  const password = randomBytes(9).toString("base64url"); // 12 caracteres
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { userId: data.user.id, password };
}

function refresh(storeId?: string) {
  revalidatePath("/admin");
  if (storeId) revalidatePath(`/admin/lojas/${storeId}`);
}

export async function createStore(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const slug = slugify(String(form.get("slug") ?? "") || name);
  const ownerEmail = String(form.get("ownerEmail") ?? "").trim().toLowerCase();
  const rawDomain = String(form.get("domain") ?? "").trim();

  if (name.length < 2 || name.length > 80) return { error: "Informe o nome da loja." };
  if (!slug) return { error: "Identificador (slug) inválido." };
  if (!isEmail(ownerEmail)) return { error: "E-mail do dono inválido." };
  const domain = rawDomain ? normalizeDomain(rawDomain) : null;
  if (rawDomain && !domain) return { error: "Domínio inválido (ex.: www.minhaloja.com.br)." };

  const { data: store, error } = await db
    .from("stores")
    .insert({ name, slug, email: ownerEmail })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Já existe uma loja com esse identificador." : "Não foi possível criar a loja." };

  try {
    if (domain) {
      const { error: dErr } = await db.from("store_domains").insert({ domain, store_id: store.id, is_primary: true });
      if (dErr) throw new Error(dErr.code === "23505" ? "Esse domínio já pertence a outra loja." : "Não foi possível vincular o domínio.");
    }
    const { userId, password } = await findOrCreateUser(db, ownerEmail);
    const { error: mErr } = await db.from("store_members").insert({ store_id: store.id, user_id: userId, role: "owner" });
    if (mErr) throw new Error("Não foi possível vincular o dono.");

    refresh();
    if (password) {
      // Mostra a senha uma vez; depois disso o admin vai para a página da loja.
      return { ok: `Loja criada. Usuário ${ownerEmail} criado.`, password };
    }
  } catch (err) {
    await db.from("stores").delete().eq("id", store.id); // desfaz (domínios e membros vão em cascata)
    return { error: err instanceof Error ? err.message : "Não foi possível criar a loja." };
  }
  redirect(`/admin/lojas/${store.id}`);
}

export async function setStoreStatus(form: FormData) {
  const { db } = await requireAdmin();
  const id = String(form.get("storeId") ?? "");
  const status = form.get("status") === "suspended" ? "suspended" : "active";
  if (!isUuid(id)) return;
  await db.from("stores").update({ status }).eq("id", id);
  refresh(id);
}

export async function addDomain(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!isUuid(storeId)) return { error: "Loja inválida." };
  if (!domain) return { error: "Domínio inválido (ex.: www.minhaloja.com.br)." };

  const { count } = await db.from("store_domains").select("domain", { count: "exact", head: true }).eq("store_id", storeId);
  const { error } = await db.from("store_domains").insert({ domain, store_id: storeId, is_primary: (count ?? 0) === 0 });
  if (error) return { error: error.code === "23505" ? "Esse domínio já está vinculado a uma loja." : "Não foi possível vincular." };
  refresh(storeId);
  return { ok: `Domínio ${domain} vinculado. Adicione-o também no projeto da Vercel.` };
}

export async function removeDomain(form: FormData) {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const domain = String(form.get("domain") ?? "");
  if (!isUuid(storeId)) return;
  await db.from("store_domains").delete().eq("domain", domain).eq("store_id", storeId);
  // Se removeu o principal, promove outro.
  const { data: rest } = await db.from("store_domains").select("domain, is_primary").eq("store_id", storeId);
  if (rest?.length && !rest.some((d) => d.is_primary)) {
    await db.from("store_domains").update({ is_primary: true }).eq("domain", rest[0].domain);
  }
  refresh(storeId);
}

export async function setPrimaryDomain(form: FormData) {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const domain = String(form.get("domain") ?? "");
  if (!isUuid(storeId)) return;
  await db.from("store_domains").update({ is_primary: false }).eq("store_id", storeId);
  await db.from("store_domains").update({ is_primary: true }).eq("store_id", storeId).eq("domain", domain);
  refresh(storeId);
}

export async function addMember(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isUuid(storeId)) return { error: "Loja inválida." };
  if (!isEmail(email)) return { error: "E-mail inválido." };

  try {
    const { userId, password } = await findOrCreateUser(db, email);
    const { error } = await db
      .from("store_members")
      .upsert({ store_id: storeId, user_id: userId, role: "owner" }, { onConflict: "store_id,user_id", ignoreDuplicates: true });
    if (error) return { error: "Não foi possível vincular." };
    refresh(storeId);
    return password ? { ok: `Usuário ${email} criado e vinculado.`, password } : { ok: `${email} vinculado à loja.` };
  } catch {
    return { error: "Não foi possível criar o usuário." };
  }
}

export async function removeMember(form: FormData) {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const userId = String(form.get("userId") ?? "");
  if (!isUuid(storeId) || !isUuid(userId)) return;
  await db.from("store_members").delete().eq("store_id", storeId).eq("user_id", userId);
  refresh(storeId);
}

// Credenciais: campo vazio = mantém o valor atual. Nunca devolvemos os valores para a tela.
export async function saveSecrets(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  if (!isUuid(storeId)) return { error: "Loja inválida." };

  const fields = ["gateway_access_token", "gateway_public_key", "gateway_webhook_secret", "melhor_envio_token"] as const;
  const patch: Record<string, string | null> = {};
  for (const f of fields) {
    const value = String(form.get(f) ?? "").trim();
    if (form.get(`clear_${f}`) === "on") patch[f] = null;
    else if (value) patch[f] = value;
  }
  const originZip = onlyDigits(String(form.get("origin_zip") ?? ""));
  if (originZip && originZip.length !== 8) return { error: "CEP de origem inválido." };

  const { error } = await db.from("store_secrets").upsert(
    {
      store_id: storeId,
      ...patch,
      melhor_envio_sandbox: form.get("melhor_envio_sandbox") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" },
  );
  if (error) {
    return {
      error: error.message.includes("melhor_envio_sandbox")
        ? "Rode a migration 20261021000000_melhor_envio_env_por_loja.sql antes de salvar."
        : "Não foi possível salvar as credenciais.",
    };
  }
  if (originZip) await db.from("stores").update({ origin_zip: originZip }).eq("id", storeId);

  refresh(storeId);
  return { ok: "Configurações salvas." };
}
