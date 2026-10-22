"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { isEmail, onlyDigits } from "@/lib/validation";
import { isValidBannerLink } from "@/lib/banner";
import { parseBRL } from "@/lib/money";

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
  // Logo e banner só podem vir do Storage da própria loja.
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${store.id}/`;
  if (logoUrl && !logoUrl.startsWith(storagePrefix)) return { error: "Logo inválido." };

  // Banner: só vem no formulário quando as colunas existem no banco.
  const hasBanner = form.get("banner_enabled") === "1";
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const banner = {
    banner_image_url: text("banner_image_url", 500) || null,
    banner_title: text("banner_title", 80) || null,
    banner_subtitle: text("banner_subtitle", 160) || null,
    banner_link: text("banner_link", 500) || null,
  };
  if (hasBanner) {
    if (banner.banner_image_url && !banner.banner_image_url.startsWith(storagePrefix)) return { error: "Imagem do banner inválida." };
    if (banner.banner_link && !isValidBannerLink(banner.banner_link)) {
      return { error: "Link do banner inválido: use um caminho da loja (ex.: /c/promocoes) ou um endereço https://." };
    }
  }

  // Promoções: só vêm no formulário quando as colunas existem no banco.
  const hasPromos = form.get("promos_enabled") === "1";
  const pixPercentText = String(form.get("pix_discount_percent") ?? "").trim();
  const pixPercent = pixPercentText === "" ? 0 : Number(pixPercentText);
  const freeShippingText = String(form.get("free_shipping_min") ?? "").trim();
  const freeShippingMin = freeShippingText === "" ? null : parseBRL(freeShippingText);
  if (hasPromos) {
    if (!Number.isInteger(pixPercent) || pixPercent < 0 || pixPercent > 30) return { error: "Desconto no Pix: use um número inteiro de 0 a 30 (%)." };
    if (freeShippingText && (freeShippingMin === null || freeShippingMin <= 0)) return { error: "Frete grátis: valor inválido. Use o formato 199,90." };
  }

  const { data, error } = await supabase
    .from("stores")
    .update({
      name,
      primary_color: color,
      email: email || null,
      whatsapp: whatsapp || null,
      origin_zip: originZip || null,
      logo_url: logoUrl || null,
      ...(hasBanner ? banner : {}),
      ...(hasPromos ? { pix_discount_percent: pixPercent, free_shipping_min_cents: freeShippingMin } : {}),
    })
    .eq("id", store.id)
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar." };

  revalidatePath("/painel", "layout");
  return { ok: "Configurações salvas. A loja atualiza em até 1 minuto." };
}
