"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { parseBioLinks } from "@/lib/bio-links";

export type BioState = { ok?: string; error?: string } | null;

// Página de links da bio: frase curta e links extras (o lojista só altera estas colunas, pelo grant do SQL).
export async function saveBio(_prev: BioState, form: FormData): Promise<BioState> {
  const { supabase, store } = await requireStore();
  const text = String(form.get("bio_text") ?? "").trim().replace(/\s+/g, " ");
  if (text.length > 160) return { error: "A frase pode ter até 160 caracteres." };
  const parsed = parseBioLinks(form.getAll("link_title"), form.getAll("link_url"));
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("stores").update({ bio_text: text || null, bio_links: parsed.links }).eq("id", store.id);
  if (error) return { error: "Não foi possível salvar agora. Tente de novo." };
  revalidatePath("/painel/divulgar");
  return { ok: "Salvo! A página já está atualizada." };
}
