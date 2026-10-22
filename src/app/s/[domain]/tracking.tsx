"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_KEY, readConsent } from "@/lib/tracking";

// Aviso de cookies + Pixel da Meta e Google Analytics da loja (LGPD: só carregam depois do "Aceitar").
// Sem nenhum ID configurado, não mostra nada: o carrinho usa só armazenamento essencial do navegador.

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function saveConsent(value: "accepted" | "rejected") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // navegador sem armazenamento: vale só nesta página
  }
  listeners.forEach((fn) => fn());
}

function loadScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadMetaPixel(id: string) {
  if (window.fbq) return;
  // Mesmo trecho oficial da Meta: enfileira as chamadas até o fbevents.js carregar e assumir.
  /* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params, prefer-spread */
  const n: any = function () {
    if (n.callMethod) n.callMethod.apply(n, arguments);
    else n.queue.push(arguments);
  };
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  window.fbq = n;
  (window as any)._fbq = n;
  /* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params, prefer-spread */
  loadScript("https://connect.facebook.net/en_US/fbevents.js");
  n("init", id);
}

function loadGoogleAnalytics(id: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // O GA4 registra as trocas de página sozinho (medição otimizada do histórico do navegador).
  window.gtag("config", id);
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

export function Tracking({ metaPixelId, gaMeasurementId }: { metaPixelId: string | null; gaMeasurementId: string | null }) {
  const consent = useSyncExternalStore(subscribe, readConsent, () => "rejected" as const);
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const enabled = !!(metaPixelId || gaMeasurementId);

  useEffect(() => {
    if (!enabled || consent !== "accepted") return;
    if (metaPixelId) loadMetaPixel(metaPixelId);
    if (gaMeasurementId) loadGoogleAnalytics(gaMeasurementId);
  }, [enabled, consent, metaPixelId, gaMeasurementId]);

  // Visualização de página do Pixel (o GA4 já registra sozinho).
  useEffect(() => {
    if (!enabled || consent !== "accepted" || lastPath.current === pathname) return;
    lastPath.current = pathname;
    window.fbq?.("track", "PageView");
  }, [enabled, consent, pathname]);

  if (!enabled || consent !== null) return null;

  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-neutral-700">
          Usamos cookies para entender as visitas e melhorar nossos anúncios. Você pode aceitar ou recusar.{" "}
          <a href="/politica-de-privacidade" className="underline">Saiba mais</a>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => saveConsent("rejected")}
            className="rounded-lg border px-4 py-2 font-medium"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => saveConsent("accepted")}
            className="rounded-lg px-4 py-2 font-semibold text-white"
            style={{ background: "var(--brand)" }}
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
