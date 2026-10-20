// Carrinho no localStorage. Cada loja tem domínio próprio, então o carrinho já é separado por loja.
// Guarda só variante e quantidade: preço e nome sempre vêm do servidor.
export type CartItem = { variantId: string; quantity: number };

const KEY = "cart";

export function readCart(): CartItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.filter((i) => i.quantity > 0)));
    window.dispatchEvent(new Event("cart:change"));
  } catch {
    // Navegação privada / storage bloqueado: o carrinho só não persiste.
  }
}

export function addToCart(variantId: string, quantity = 1) {
  const items = readCart();
  const item = items.find((i) => i.variantId === variantId);
  if (item) item.quantity += quantity;
  else items.push({ variantId, quantity });
  writeCart(items);
}

export function clearCart() {
  writeCart([]);
}
