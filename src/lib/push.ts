import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformUrl } from "@/lib/urls";

// Notificações no celular do lojista (Web Push), além do e-mail: "Nova venda", "Novo agendamento"...
// Chaves VAPID em VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (gerar com `npx web-push generate-vapid-keys`).
// Sem as chaves, não envia nada (e o painel nem oferece a opção).

export type PushMessage = {
  title: string;
  body: string;
  url: string; // caminho no painel, ex.: /painel/pedidos/<id>
  tag?: string; // mesma tag substitui a notificação anterior em vez de empilhar
};

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

// Serviços de push dos navegadores. O endereço vem do navegador do lojista: só aceitamos estes
// (o servidor faz um POST nele, então não pode ser um endereço qualquer).
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

function configured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  // Contato da plataforma para os serviços de push: precisa ser https (em dev, PLATFORM_URL é http://localhost).
  const subject = platformUrl().startsWith("https://") ? platformUrl() : "https://pmsapp.dev";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function send(subs: Subscription[], msg: PushMessage) {
  if (!subs.length || !configured()) return 0;
  const payload = JSON.stringify(msg);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        // TTL: aviso que não chegou em 1 dia (celular desligado) já não interessa; urgency high acorda o Android.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400, urgency: "high" });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: o lojista desativou ou desinstalou; a inscrição não volta mais.
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("Falha ao enviar push", status, (err as Error).message);
      }
    }),
  );
  if (gone.length) await createAdminClient().from("push_subscriptions").delete().in("id", gone);
  return sent;
}

// Para todos os aparelhos da loja. Nunca lança erro (o aviso é um extra; a venda já está registrada).
export async function pushToStore(storeId: string, msg: PushMessage) {
  try {
    if (!configured()) return 0;
    const { data } = await createAdminClient().from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("store_id", storeId);
    return await send((data ?? []) as Subscription[], msg);
  } catch (err) {
    console.error("Falha nas notificações da loja", { storeId, err });
    return 0;
  }
}

// Só para um aparelho (botão "Enviar teste" do painel).
export async function pushToEndpoint(storeId: string, endpoint: string, msg: PushMessage) {
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("store_id", storeId)
    .eq("endpoint", endpoint);
  return send((data ?? []) as Subscription[], msg);
}
