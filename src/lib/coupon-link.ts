// Cupom vindo de um link da loja (loja.com.br/?cupom=BEMVINDO10, em post, story ou campanha): fica guardado no
// navegador e o checkout já abre com ele. localStorage é por domínio, então cada loja guarda o seu.
const KEY = "cupom";

export function saveCouponFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get("cupom")?.trim().toUpperCase();
    if (code && /^[A-Z0-9_-]{3,30}$/.test(code)) localStorage.setItem(KEY, code);
  } catch {
    // storage bloqueado: o cliente digita o cupom no checkout
  }
}

export function savedCoupon() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetCoupon() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada a fazer
  }
}
