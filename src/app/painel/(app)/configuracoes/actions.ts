"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { isEmail, onlyDigits } from "@/lib/validation";

export type SettingsState = { error?: string; ok?: string } | null;

// O lojista só consegue alterar estas colunas (grant da migration inicial); status e slug são do super-admin.
export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase, store } = await requireStore();

  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const color = String(form.get("primary_color") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const logoUrl = String(form.get("logo_url") ?? "").trim();
  const originZip = onlyDigits(String(form.get("origin_zip") ?? ""));
  let whatsapp = onlyDigits(String(form.get("whatsapp") ?? ""));
  if (whatsapp.length === 10 || whatsapp.length === 11) whatsapp = `55${whatsapp}`; // DDD + número → com DDI

  if (name.length < 2 || name.length > 80) return { error: "Informe o nome da loja (até 80 caracteres)." };
  if (!/^#[0-9a-f]{6}$/.test(color)) return { error: "Cor inválida." };
  if (email && !isEmail(email)) return { error: "E-mail inválido." };
  if (whatsapp && !/^55\d{10,11}$/.test(whatsapp)) return { error: "WhatsApp inválido: use DDD + número." };
  if (originZip && originZip.length !== 8) return { error: "CEP de origem inválido." };
  // O logo só pode vir do Storage da própria loja.
  const logoPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${store.id}/`;
  if (logoUrl && !logoUrl.startsWith(logoPrefix)) return { error: "Logo inválido." };

  const { data, error } = await supabase
    .from("stores")
    .update({
      name,
      primary_color: color,
      email: email || null,
      whatsapp: whatsapp || null,
      origin_zip: originZip || null,
      logo_url: logoUrl || null,
    })
    .eq("id", store.id)
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar." };

  revalidatePath("/painel", "layout");
  return { ok: "Configurações salvas. A loja atualiza em até 1 minuto." };
}
