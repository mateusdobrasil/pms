import "server-only";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBRL } from "@/lib/money";
import { storeBaseUrl } from "@/lib/urls";
import { isUuid } from "@/lib/validation";
import { linkState, type LinkStatus } from "@/lib/payment-links";

// QR codes para divulgar a loja no mundo físico (balcão, vitrine, sacola, cartão de visita).
// O QR aponta sempre para o domínio principal da loja.

export type QrTarget = { kind: "loja" | "agendar" | "link"; title: string; subtitle: string; url: string; filename: string };

async function storeAddress(db: SupabaseClient, storeId: string) {
  const { data } = await db.from("store_domains").select("domain, is_primary").eq("store_id", storeId);
  const domain = (data ?? []).find((d) => d.is_primary)?.domain ?? data?.[0]?.domain;
  return domain ? storeBaseUrl(domain) : null;
}

async function agendaOn(db: SupabaseClient, storeId: string) {
  const { data } = await db.from("stores").select("booking_enabled").eq("id", storeId).maybeSingle();
  return !!(data as { booking_enabled?: boolean } | null)?.booking_enabled;
}

// Os QR fixos da loja: a loja e, com agenda ligada, a página de agendar.
export async function storeQrTargets(db: SupabaseClient, storeId: string): Promise<QrTarget[]> {
  const base = await storeAddress(db, storeId);
  if (!base) return [];
  const targets: QrTarget[] = [
    { kind: "loja", title: "Compre pelo celular", subtitle: "Aponte a câmera do celular para ver os produtos e comprar com Pix ou cartão.", url: base, filename: "qr-loja.png" },
  ];
  if (await agendaOn(db, storeId)) {
    targets.push({ kind: "agendar", title: "Agende seu horário", subtitle: "Aponte a câmera do celular e escolha o melhor dia e horário.", url: `${base}/agendar`, filename: "qr-agendar.png" });
  }
  return targets;
}

// "?alvo=loja", "?alvo=agendar" ou "?alvo=link&id=<token do link de pagamento>".
export async function resolveQrTarget(db: SupabaseClient, storeId: string, alvo: string | undefined, id: string | undefined): Promise<QrTarget | null> {
  if (alvo === "link") {
    if (!id || !isUuid(id)) return null;
    const base = await storeAddress(db, storeId);
    const { data } = await db.from("payment_links").select("title, amount_cents, status, expires_at").eq("store_id", storeId).eq("public_token", id).maybeSingle();
    const link = data as { title: string; amount_cents: number; status: LinkStatus; expires_at: string | null } | null;
    if (!base || !link || linkState(link) !== "active") return null;
    return { kind: "link", title: link.title, subtitle: `${formatBRL(link.amount_cents)} · aponte a câmera e pague com Pix ou cartão.`, url: `${base}/pagar/${id}`, filename: "qr-pagamento.png" };
  }
  return (await storeQrTargets(db, storeId)).find((t) => t.kind === alvo) ?? null;
}

// SVG para a tela e a impressão (nítido em qualquer tamanho). Correção "M": aguenta um pouco de sujeira ou dobra.
export const qrSvg = (url: string) => QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });

// PNG grande para baixar (redes sociais, gráfica).
export const qrPng = (url: string) => QRCode.toBuffer(url, { type: "png", width: 1200, margin: 2, errorCorrectionLevel: "M" });
