import { CartView } from "./cart-view";

export const metadata = { title: "Carrinho", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Carrinho</h1>
      <CartView />
    </div>
  );
}
