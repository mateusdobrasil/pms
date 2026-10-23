"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { isEmail, isValidDocument, onlyDigits } from "@/lib/validation";
import { isValidBannerLink } from "@/lib/banner";
import { parseBRL } from "@/lib/money";
import { parseGoogleVerification, parseInstagramHandle } from "@/lib/store-marketing";
import { parseShippingMode } from "@/lib/shipping-mode";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Instagram e rastreamento: só vêm no formulário quando as colunas existem no banco.
  const hasMarketing = form.get("marketing_enabled") === "1";
  const instagramText = String(form.get("instagram") ?? "").trim();
  const instagram = instagramText ? parseInstagramHandle(instagramText) : null;
  const metaPixelId = String(form.get("meta_pixel_id") ?? "").replace(/\s/g, "");
  const gaId = String(form.get("ga_measurement_id") ?? "").trim().toUpperCase();
  if (hasMarketing) {
    if (instagramText && !instagram) return { error: "Instagram inválido: use o nome de usuário, por exemplo @minhaloja." };
    if (metaPixelId && !/^[0-9]{5,20}$/.test(metaPixelId)) return { error: "ID do Pixel da Meta inválido: são só números." };
    if (gaId && !/^G-[A-Z0-9]{4,15}$/.test(gaId)) return { error: "ID do Google Analytics inválido: começa com G-, por exemplo G-ABC123XYZ." };
  }

  // Verificação do Google: só vem no formulário quando a coluna existe no banco.
  const hasGoogle = form.get("google_enabled") === "1";
  const googleText = String(form.get("google_site_verification") ?? "").trim();
  const googleVerification = googleText ? parseGoogleVerification(googleText) : null;
  if (hasGoogle && googleText && !googleVerification) {
    return { error: "Código de verificação do Google inválido: cole a etiqueta inteira ou só o código (content)." };
  }

  // Dados da empresa e políticas: só vêm no formulário quando as colunas existem no banco.
  const hasLegal = form.get("legal_enabled") === "1";
  const legalName = text("legal_name", 150);
  const documentText = String(form.get("document") ?? "").trim();
  const legalAddress = text("address", 250);
  const policy = (key: string) => String(form.get(key) ?? "").replace(/\r\n/g, "\n").trim();
  const privacyPolicy = policy("privacy_policy");
  const returnsPolicy = policy("returns_policy");
  // Agendamentos: só vêm no formulário quando as colunas existem (SQL 20261101000000).
  const hasBooking = form.get("booking_settings") === "1";
  const pick = (name: string, allowed: number[], fallback: number) => {
    const v = Number(form.get(name));
    return allowed.includes(v) ? v : fallback;
  };
  const booking = {
    booking_enabled: form.get("booking_enabled") === "on",
    booking_slot_minutes: pick("booking_slot_minutes", [10, 15, 20, 30, 60], 30),
    booking_min_notice_minutes: pick("booking_min_notice_minutes", [0, 30, 60, 120, 240, 720, 1440, 2880], 120),
    booking_max_days: pick("booking_max_days", [7, 14, 30, 60, 90], 30),
    booking_cancel_hours: pick("booking_cancel_hours", [0, 2, 12, 24, 48], 24),
  };
  // Forma de entrega: só vem no formulário quando a coluna existe (SQL 20261102000000).
  const hasShipping = form.get("shipping_enabled") === "1";
  const shippingMode = parseShippingMode(form.get("shipping_mode"));
  if (hasShipping) {
    if (!shippingMode) return { error: "Escolha uma forma de entrega." };
    // "Somente Melhor Envio" sem Melhor Envio funcionando deixaria a loja sem nenhuma forma de entrega.
    if (shippingMode === "me") {
      const { data: secret } = await createAdminClient()
        .from("store_secrets")
        .select("melhor_envio_token")
        .eq("store_id", store.id)
        .maybeSingle();
      if (!secret?.melhor_envio_token) {
        return { error: "Para usar \"Somente Melhor Envio\", o Melhor Envio precisa estar ligado na loja. Fale com o suporte." };
      }
      if (originZip.length !== 8) return { error: "Para usar \"Somente Melhor Envio\", preencha o CEP de origem." };
    }
  }
  const hasAbout = form.get("about_enabled") === "1";
  const about = String(form.get("about") ?? "").replace(/\r\n/g, "\n").trim();
  if (hasAbout && about.length > 1000) return { error: "Quem somos muito longo (até 1.000 caracteres)." };
  if (hasLegal) {
    if (legalName && legalName.length < 2) return { error: "Nome empresarial muito curto." };
    if (documentText && !isValidDocument(documentText)) return { error: "CNPJ ou CPF inválido. Confira os números." };
    if (legalAddress && legalAddress.length < 5) return { error: "Endereço muito curto." };
    if (privacyPolicy.length > 20000 || returnsPolicy.length > 20000) return { error: "Política muito longa (até 20.000 caracteres)." };
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
      ...(hasGoogle ? { google_site_verification: googleVerification } : {}),
      ...(hasLegal
        ? {
            legal_name: legalName || null,
            document: documentText ? onlyDigits(documentText) : null,
            address: legalAddress || null,
            privacy_policy: privacyPolicy || null,
            returns_policy: returnsPolicy || null,
          }
        : {}),
      ...(hasAbout ? { about: about || null } : {}),
      ...(hasBooking ? booking : {}),
      ...(hasShipping && shippingMode ? { shipping_mode: shippingMode } : {}),
      ...(hasMarketing ? { instagram, meta_pixel_id: metaPixelId || null, ga_measurement_id: gaId || null } : {}),
      ...(hasPromos ? { pix_discount_percent: pixPercent, free_shipping_min_cents: freeShippingMin } : {}),
    })
    .eq("id", store.id)
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar." };

  revalidatePath("/painel", "layout");
  return { ok: "Configurações salvas. A loja atualiza em até 1 minuto." };
}
