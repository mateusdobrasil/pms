"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { normalizeDomain, requireAdmin } from "@/lib/admin";
import { removeStoreLogo, uploadStoreLogo, validateLogo } from "@/lib/branding";
import { slugify } from "@/lib/slug";
import { isStoreSubdomain, storeDomainError, storeSubdomain } from "@/lib/store-domains";
import { isEmail, isUuid, onlyDigits } from "@/lib/validation";
import { BILLING, isDueDay, todayBR } from "@/lib/billing";
import { parseBRL } from "@/lib/money";
import { WA_AUTO_EVENTS } from "@/lib/whatsapp-events";

const MAX_FEE_CENTS = 10_000_000; // R$ 100.000,00: trava contra erro de digitação
import { issueInvoices, reactivateIfClear } from "@/lib/billing-server";
import { notifyInvoice } from "@/lib/email";

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

// "" (campo vazio) → null = manter padrão; inválida → undefined.
function readColor(form: FormData): string | null | undefined {
  const raw = String(form.get("primary_color") ?? "").trim().toLowerCase();
  if (!raw) return null;
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : undefined;
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
  const color = readColor(form);
  const logo = form.get("logo") instanceof File ? (form.get("logo") as File) : null;

  if (name.length < 2 || name.length > 80) return { error: "Informe o nome da loja." };
  if (color === undefined) return { error: "Cor inválida." };
  const logoError = validateLogo(logo);
  if (logoError) return { error: logoError };
  if (!slug) return { error: "Identificador (slug) inválido." };
  if (!isEmail(ownerEmail)) return { error: "E-mail do dono inválido." };
  // Sem domínio próprio, a loja nasce em <identificador>.minhaloja.promo.
  const domain = normalizeDomain(rawDomain || storeSubdomain(slug));
  if (!domain) {
    return { error: rawDomain ? "Domínio inválido (ex.: www.minhaloja.com.br)." : "Identificador longo demais para virar endereço. Use um mais curto." };
  }
  const domainError = storeDomainError(domain);
  if (domainError) return { error: rawDomain ? domainError : `${domainError} O identificador vira o endereço da loja.` };

  const { data: store, error } = await db
    .from("stores")
    .insert({ name, slug, email: ownerEmail, ...(color ? { primary_color: color } : {}) })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Já existe uma loja com esse identificador." : "Não foi possível criar a loja." };

  let logoUrl: string | null = null;
  try {
    if (logo && logo.size > 0) {
      logoUrl = await uploadStoreLogo(db, store.id, logo);
      await db.from("stores").update({ logo_url: logoUrl }).eq("id", store.id);
    }
    const { error: dErr } = await db.from("store_domains").insert({ domain, store_id: store.id, is_primary: true });
    if (dErr) throw new Error(dErr.code === "23505" ? `O domínio ${domain} já pertence a outra loja.` : "Não foi possível vincular o domínio.");
    const { userId, password } = await findOrCreateUser(db, ownerEmail);
    const { error: mErr } = await db.from("store_members").insert({ store_id: store.id, user_id: userId, role: "owner" });
    if (mErr) throw new Error("Não foi possível vincular o dono.");

    refresh();
    if (password) {
      // Mostra a senha uma vez; depois disso o admin vai para a página da loja.
      return { ok: `Loja criada. Usuário ${ownerEmail} criado.`, password };
    }
  } catch (err) {
    await removeStoreLogo(db, store.id, logoUrl);
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
  // Decisão manual do admin: a loja deixa de contar como "suspensa pela cobrança" (coluna do SQL 20261024000000).
  await db.from("stores").update({ suspended_for_billing: false }).eq("id", id);
  refresh(id);
}

// Lembrete de agendamento por WhatsApp: decisão do admin (o custo por mensagem é da plataforma).
export async function setWhatsappReminders(form: FormData) {
  const { db } = await requireAdmin();
  const id = String(form.get("storeId") ?? "");
  if (!isUuid(id)) return;
  await db.from("stores").update({ whatsapp_reminders: form.get("enabled") === "1" }).eq("id", id);
  refresh(id);
  revalidatePath("/admin/whatsapp");
}

// Cota mensal de mensagens de campanha (marketing) da loja; 0 = sem campanhas.
export async function setWhatsappCampaignQuota(form: FormData) {
  const { db } = await requireAdmin();
  const id = String(form.get("storeId") ?? "");
  const quota = Number(form.get("quota"));
  if (!isUuid(id) || !Number.isInteger(quota) || quota < 0 || quota > 100000) return;
  await db.from("stores").update({ whatsapp_campaign_quota: quota }).eq("id", id);
  refresh(id);
  revalidatePath("/admin/whatsapp");
}

// Eventos do WhatsApp que a loja usa (todos marcados = nulo: entra também evento novo que for criado).
export async function setWhatsappEvents(form: FormData) {
  const { db } = await requireAdmin();
  const id = String(form.get("storeId") ?? "");
  if (!isUuid(id)) return;
  const chosen = WA_AUTO_EVENTS.filter((e) => form.getAll("events").includes(e));
  await db.from("stores").update({ whatsapp_events: chosen.length === WA_AUTO_EVENTS.length ? null : chosen }).eq("id", id);
  refresh(id);
}

export async function addDomain(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!isUuid(storeId)) return { error: "Loja inválida." };
  if (!domain) return { error: "Domínio inválido (ex.: www.minhaloja.com.br)." };
  const domainError = storeDomainError(domain);
  if (domainError) return { error: domainError };

  const { count } = await db.from("store_domains").select("domain", { count: "exact", head: true }).eq("store_id", storeId);
  const { error } = await db.from("store_domains").insert({ domain, store_id: storeId, is_primary: (count ?? 0) === 0 });
  if (error) return { error: error.code === "23505" ? "Esse domínio já está vinculado a uma loja." : "Não foi possível vincular." };
  refresh(storeId);
  return {
    ok: isStoreSubdomain(domain)
      ? `Domínio ${domain} vinculado e já no ar.`
      : `Domínio ${domain} vinculado. Adicione-o também no projeto da Vercel.`,
  };
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

// Identidade da loja (nome, cor, logo) editada pelo super-admin.
export async function updateBranding(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  if (!isUuid(storeId)) return { error: "Loja inválida." };
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const color = readColor(form);
  const logo = form.get("logo") instanceof File ? (form.get("logo") as File) : null;
  const removeLogo = form.get("removeLogo") === "on";

  if (name.length < 2 || name.length > 80) return { error: "Informe o nome da loja." };
  if (!color) return { error: "Cor inválida." };
  const logoError = validateLogo(logo);
  if (logoError) return { error: logoError };

  const { data: current } = await db.from("stores").select("logo_url").eq("id", storeId).single();
  const patch: Record<string, string | null> = { name, primary_color: color };
  try {
    if (logo && logo.size > 0) patch.logo_url = await uploadStoreLogo(db, storeId, logo);
    else if (removeLogo) patch.logo_url = null;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao enviar o logo." };
  }

  const { error } = await db.from("stores").update(patch).eq("id", storeId);
  if (error) {
    if (patch.logo_url) await removeStoreLogo(db, storeId, patch.logo_url);
    return { error: "Não foi possível salvar." };
  }
  // O logo anterior só sai do Storage depois que o novo foi gravado.
  if ("logo_url" in patch) await removeStoreLogo(db, storeId, current?.logo_url ?? null);

  refresh(storeId);
  revalidatePath("/painel", "layout");
  return { ok: "Identidade salva. A vitrine atualiza em até 1 minuto." };
}

// ---------------------------------------------------------------- cobrança (implantação e mensalidade)

export async function saveBilling(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  if (!isUuid(storeId)) return { error: "Loja inválida." };
  // Valor digitado ("2.000,00"); vazio = isento.
  const fee = (name: string) => {
    const raw = String(form.get(name) ?? "").trim();
    return raw ? parseBRL(raw) : 0;
  };
  const setup = fee("setup_fee");
  const monthly = fee("monthly_fee");
  const startsOn = String(form.get("billing_starts_on") ?? "");
  if (setup === null || setup > MAX_FEE_CENTS) return { error: "Valor da implantação inválido (ex.: 2.000,00)." };
  if (monthly === null || monthly > MAX_FEE_CENTS) return { error: "Valor da mensalidade inválido (ex.: 300,00)." };
  if (monthly && !isDueDay(startsOn)) return { error: `Escolha o vencimento da 1ª mensalidade (dia ${BILLING.dueDay}).` };

  const { error } = await db
    .from("stores")
    .update({ setup_fee_cents: setup, monthly_fee_cents: monthly, billing_starts_on: monthly ? startsOn : null })
    .eq("id", storeId);
  if (error) return { error: "Não foi possível salvar. O SQL da cobrança (20261024000000) já foi rodado?" };

  // Isento: cancela o que estava em aberto.
  const today = todayBR();
  if (!setup) await db.from("store_invoices").update({ status: "canceled" }).eq("store_id", storeId).eq("kind", "setup").eq("status", "open");
  else await db.from("store_invoices").update({ amount_cents: setup }).eq("store_id", storeId).eq("kind", "setup").eq("status", "open");
  if (!monthly) await db.from("store_invoices").update({ status: "canceled" }).eq("store_id", storeId).eq("kind", "monthly").eq("status", "open");
  const created = await issueInvoices(db, today, storeId);
  await reactivateIfClear(db, storeId, today);

  // Fatura nova: o lojista recebe o e-mail na hora (as vencidas ficam com o aviso de atraso do job diário).
  const { data: fresh } = await db
    .from("store_invoices")
    .select("id")
    .eq("store_id", storeId)
    .eq("status", "open")
    .is("notified_issued_at", null)
    .gte("due_date", today);
  after(async () => {
    for (const inv of fresh ?? []) await notifyInvoice(inv.id, "issued");
  });

  refresh(storeId);
  return { ok: created ? `Cobrança salva. ${created} fatura(s) emitida(s) e enviada(s) por e-mail ao lojista.` : "Cobrança salva." };
}

// Pagamento recebido fora do Mercado Pago (transferência, dinheiro): baixa manual.
export async function markInvoicePaid(form: FormData) {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const invoiceId = String(form.get("invoiceId") ?? "");
  if (!isUuid(storeId) || !isUuid(invoiceId)) return;
  const { data } = await db
    .from("store_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "manual" })
    .eq("id", invoiceId)
    .eq("store_id", storeId)
    .eq("status", "open")
    .select("id");
  if (data?.length) {
    await reactivateIfClear(db, storeId);
    after(() => notifyInvoice(invoiceId, "paid"));
  }
  refresh(storeId);
}

export async function cancelInvoice(form: FormData) {
  const { db } = await requireAdmin();
  const storeId = String(form.get("storeId") ?? "");
  const invoiceId = String(form.get("invoiceId") ?? "");
  if (!isUuid(storeId) || !isUuid(invoiceId)) return;
  await db.from("store_invoices").update({ status: "canceled" }).eq("id", invoiceId).eq("store_id", storeId).eq("status", "open");
  await reactivateIfClear(db, storeId);
  refresh(storeId);
}
