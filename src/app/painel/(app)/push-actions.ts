"use server";

import { headers } from "next/headers";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushEndpoint, pushToEndpoint } from "@/lib/push";

type SubscriptionInput = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
const KEY = /^[A-Za-z0-9_-]{16,200}={0,2}$/;

// "Android · Chrome", "iPhone · Safari"...: para o lojista reconhecer o aparelho.
function deviceLabel(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "Computador";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${os} · ${browser}`;
}

// Liga os avisos neste aparelho. Também roda ao abrir o Resumo (mantém o aparelho ligado à loja e ao usuário atuais).
export async function savePushSubscription(sub: SubscriptionInput) {
  const { store, userId } = await requireStore();
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!isPushEndpoint(endpoint) || endpoint.length > 1000 || !KEY.test(p256dh) || !KEY.test(auth)) {
    return { error: "Este navegador não forneceu uma inscrição válida." };
  }
  const device = deviceLabel((await headers()).get("user-agent") ?? "");
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ store_id: store.id, user_id: userId, endpoint, p256dh, auth, device }, { onConflict: "endpoint" });
  if (error) {
    console.error("Falha ao salvar inscrição de push", error.message);
    return { error: "Não foi possível ativar agora. Tente de novo." };
  }
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const { store } = await requireStore();
  if (typeof endpoint !== "string") return;
  await createAdminClient().from("push_subscriptions").delete().eq("store_id", store.id).eq("endpoint", endpoint);
}

export async function sendTestPush(endpoint: string) {
  const { store } = await requireStore();
  if (typeof endpoint !== "string") return { error: "Aparelho inválido." };
  const sent = await pushToEndpoint(store.id, endpoint, {
    title: "Notificações ativadas ✅",
    body: `Você vai receber aqui um aviso a cada venda e agendamento da ${store.name}.`,
    url: "/painel",
    tag: "teste",
  });
  return sent ? { ok: true } : { error: "Não foi possível enviar. Desative e ative de novo neste aparelho." };
}
