"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./push-actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";
type InstallEvent = Event & { prompt: () => Promise<void> };

const SW_URL = "/painel-sw.js";

// Chave pública VAPID (base64url) no formato que o pushManager.subscribe espera.
function toKey(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

// Resumo: aviso de venda/agendamento no celular (Web Push) e "Instalar o app" (PWA).
export function PushCard({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onInstall = (e: Event) => {
      e.preventDefault(); // guarda o convite para o botão "Instalar o app"
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);

    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const reg = supported ? await navigator.serviceWorker.register(SW_URL, { scope: "/painel" }).catch(() => null) : null;
      if (!reg) {
        // iPhone: notificações só com o painel instalado na tela de início (iOS 16.4+).
        setState(/iPhone|iPad/.test(navigator.userAgent) && !standalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const sub = await reg.pushManager.getSubscription();
      // Já ativo: confirma no servidor (o aparelho fica ligado à loja e ao usuário de agora).
      if (sub) void savePushSubscription(sub.toJSON());
      setState(sub ? "on" : "off");
    })();

    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const res = await savePushSubscription(sub.toJSON());
      if (res.error) {
        setMessage(res.error);
        return;
      }
      setState("on");
      const test = await sendTestPush(sub.endpoint);
      setMessage(test.error ?? "Pronto! Enviamos uma notificação de teste.");
    } catch {
      setMessage("Não foi possível ativar neste navegador. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe().catch(() => null);
    }
    setState("off");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    const res = sub ? await sendTestPush(sub.endpoint) : { error: "Ative de novo neste aparelho." };
    setMessage(res.error ?? "Enviada! Ela aparece em alguns segundos.");
    setBusy(false);
  }

  async function install() {
    await installEvent?.prompt();
    setInstallEvent(null);
  }

  if (state === "loading") return null;

  const link = "font-medium underline underline-offset-2 disabled:opacity-50";
  const installButton = installEvent && (
    <button type="button" onClick={install} className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:border-neutral-400">
      Instalar o app
    </button>
  );

  if (state === "on") {
    return (
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white px-5 py-3 text-sm shadow-sm">
        <p className="font-medium text-emerald-800">🔔 Aviso de venda ativo neste aparelho</p>
        <button type="button" onClick={test} disabled={busy} className={link}>Enviar teste</button>
        <button type="button" onClick={disable} disabled={busy} className={`${link} text-neutral-500`}>Desativar</button>
        {installButton}
        {message && <p className="w-full text-neutral-600">{message}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">🔔 Aviso de venda no celular</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Receba uma notificação na hora a cada venda paga e a cada agendamento, mesmo com o painel fechado. Ative em cada
        aparelho que você usa.
      </p>
      {state === "off" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "Ativando…" : "Ativar neste aparelho"}
          </button>
          {installButton}
        </div>
      )}
      {state === "ios-install" && (
        <p className="mt-3 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          No iPhone, os avisos funcionam com o painel instalado: no Safari, toque em <strong>Compartilhar</strong> e depois em{" "}
          <strong>Adicionar à Tela de Início</strong>. Abra o PMS app pelo ícone novo, entre e ative aqui.
        </p>
      )}
      {state === "denied" && (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          As notificações estão bloqueadas neste navegador. Toque no cadeado ao lado do endereço → Permissões →{" "}
          <strong>Notificações: permitir</strong>, e recarregue a página.
        </p>
      )}
      {state === "unsupported" && (
        <p className="mt-3 text-sm text-neutral-500">
          Este navegador não recebe notificações. No Android, use o Chrome; no iPhone, o Safari com o app instalado.
        </p>
      )}
      {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}
    </section>
  );
}
