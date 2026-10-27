"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";

export type ReplyState = { ok?: string; error?: string } | null;

// Resposta pública do lojista (vazio apaga a resposta). Avaliações só são gravadas pelo servidor, presas à loja do login.
export async function replyToReview(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  const { store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Avaliação inválida." };
  const reply = String(form.get("reply") ?? "").replace(/\r\n/g, "\n").trim();
  if (reply.length > 1000) return { error: "A resposta pode ter até 1000 caracteres." };
  const { error } = await createAdminClient()
    .from("reviews")
    .update({ reply: reply || null, replied_at: reply ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("store_id", store.id);
  if (error) return { error: "Não foi possível salvar agora." };
  revalidatePath("/painel/avaliacoes");
  return { ok: reply ? "Resposta publicada." : "Resposta apagada." };
}

// Ocultar só avaliação ofensiva (com o motivo); mostrar de novo a qualquer momento.
export async function setReviewHidden(form: FormData) {
  const { store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const hide = form.get("hide") === "1";
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  if (hide && !reason) return;
  await createAdminClient().from("reviews").update({ hidden: hide, hidden_reason: hide ? reason : null }).eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/avaliacoes");
}
