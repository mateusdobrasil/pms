import { OrderLookup } from "./order-lookup";

export const metadata = { title: "Meus pedidos", robots: { index: false } };

export default function MyOrdersPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Meus pedidos</h1>
      <p className="mt-2 mb-6 text-neutral-600">
        Informe o número do pedido ou o seu CPF, junto com o e-mail usado na compra.
      </p>
      <OrderLookup />
    </div>
  );
}
