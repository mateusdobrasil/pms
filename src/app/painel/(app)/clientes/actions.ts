"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";

const validKey = (key: unknown): key is string => typeof key === "string" && key.length >= 5 && key.length <= 200;

// Ao tocar em "Chamar no WhatsApp": registra a data para o lojista não chamar a mesma pessoa duas vezes.
export async function markContacted(key: string) {
  const { supabase, store } = await requireStore();
  if (!validKey(key)) return;
  const now = new Date().toISOString();
  await supabase.from("customer_contacts").upsert({ store_id: store.id, customer_key: key, contacted_at: now, updated_at: now }, { onConflict: "store_id,customer_key" });
  revalidatePath("/painel/clientes");
}

// "Não chamar mais" (o cliente pediu, ou não faz sentido): some da lista de sumidos. Reversível.
export async function setDoNotContact(key: string, value: boolean) {
  const { supabase, store } = await requireStore();
  if (!validKey(key)) return;
  await supabase
    .from("customer_contacts")
    .upsert({ store_id: store.id, customer_key: key, do_not_contact: value, updated_at: new Date().toISOString() }, { onConflict: "store_id,customer_key" });
  revalidatePath("/painel/clientes");
}
