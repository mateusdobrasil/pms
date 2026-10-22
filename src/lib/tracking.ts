// Eventos de anúncios (Pixel da Meta e Google Analytics), só no navegador.
// Os scripts são carregados por <Tracking> depois do "Aceitar" no aviso de cookies; antes disso
// (ou se a loja não configurou nada), estas funções simplesmente não fazem nada.

type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fbq;
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

export const CONSENT_KEY = "cookie-consent"; // "accepted" | "rejected"

export function readConsent(): "accepted" | "rejected" | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

type Item = { id: string; name: string; priceCents: number; quantity: number };

const toBRL = (cents: number) => Math.round(cents) / 100;

export function trackViewProduct(item: Item) {
  window.fbq?.("track", "ViewContent", { content_ids: [item.id], content_name: item.name, content_type: "product", value: toBRL(item.priceCents), currency: "BRL" });
  window.gtag?.("event", "view_item", { currency: "BRL", value: toBRL(item.priceCents), items: [gaItem(item)] });
}

export function trackAddToCart(item: Item) {
  const value = toBRL(item.priceCents * item.quantity);
  window.fbq?.("track", "AddToCart", { content_ids: [item.id], content_name: item.name, content_type: "product", value, currency: "BRL" });
  window.gtag?.("event", "add_to_cart", { currency: "BRL", value, items: [gaItem(item)] });
}

export function trackBeginCheckout(valueCents: number) {
  window.fbq?.("track", "InitiateCheckout", { value: toBRL(valueCents), currency: "BRL" });
  window.gtag?.("event", "begin_checkout", { currency: "BRL", value: toBRL(valueCents) });
}

// Compra: uma vez por pedido neste navegador (a página do pedido pode ser aberta várias vezes).
export function trackPurchase(orderCode: string, valueCents: number) {
  const key = `purchase-tracked:${orderCode}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    // sem armazenamento: registra assim mesmo
  }
  if (!window.fbq && !window.gtag) return; // sem consentimento ou sem IDs: não marca como enviado
  window.fbq?.("track", "Purchase", { value: toBRL(valueCents), currency: "BRL" });
  window.gtag?.("event", "purchase", { transaction_id: orderCode, currency: "BRL", value: toBRL(valueCents) });
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignora
  }
}

function gaItem(item: Item) {
  return { item_id: item.id, item_name: item.name, price: toBRL(item.priceCents), quantity: item.quantity };
}
