// Dados do cliente para preencher o checkout ao refazer um pedido expirado (sessionStorage, usado uma vez).
// Sem CPF: a página do pedido abre só com o link, então o CPF não vai para o navegador; o cliente digita de novo.
export type CheckoutPrefill = {
  name: string;
  email: string;
  phone: string;
  cep: string;
  address: { street: string; number: string; complement: string; district: string; city: string; state: string } | null;
};

const KEY = "checkout-prefill";

export function savePrefill(prefill: CheckoutPrefill) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(prefill));
  } catch {
    // storage bloqueado: o checkout só abre vazio
  }
}

export function takePrefill(): CheckoutPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutPrefill) : null;
  } catch {
    return null;
  }
}
