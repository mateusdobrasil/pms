import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Finalizar compra", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Finalizar compra</h1>
      <CheckoutForm />
    </div>
  );
}
