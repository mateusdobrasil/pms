import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productImageUrl } from "@/lib/images";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateLogo(file: File | null): string | null {
  if (!file || file.size === 0) return null;
  if (!TYPES.has(file.type)) return "Logo: use PNG, JPG ou WebP.";
  if (file.size > MAX_BYTES) return "Logo: máximo de 2 MB.";
  return null;
}

// Envia o logo pelo servidor (service role) — usado pelo super-admin, que não é membro da loja
// e por isso não passa nas políticas do Storage do navegador. Otimiza antes de gravar:
// cabe em 600×240, mantém transparência e vira WebP. Retorna a URL pública.
export async function uploadStoreLogo(db: SupabaseClient, storeId: string, file: File) {
  let body: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type;
  let ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  try {
    const sharp = (await import("sharp")).default;
    body = await sharp(body).rotate().resize({ width: 600, height: 240, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    contentType = "image/webp";
    ext = "webp";
  } catch (err) {
    console.error("Logo enviado sem otimização (sharp indisponível)", err);
  }

  const path = `${storeId}/branding/logo-${randomUUID()}.${ext}`;
  const { error } = await db.storage.from("product-images").upload(path, body, { contentType, cacheControl: "31536000" });
  if (error) throw new Error("Falha ao enviar o logo.");
  return productImageUrl(path);
}

// Apaga um logo antigo (só se for da pasta branding da própria loja).
export async function removeStoreLogo(db: SupabaseClient, storeId: string, url: string | null) {
  const prefix = productImageUrl(`${storeId}/branding/`);
  if (!url?.startsWith(prefix)) return;
  await db.storage.from("product-images").remove([url.slice(productImageUrl("").length)]);
}
