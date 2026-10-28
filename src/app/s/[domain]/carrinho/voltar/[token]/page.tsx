import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { openCartByToken } from "@/lib/abandoned-cart-server";
import { RestoreCart } from "./restore-cart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu carrinho", robots: { index: false } };

// Link do lembrete de carrinho abandonado: refaz o carrinho com o que ainda está à venda e abre o checkout.
export default async function RestoreCartPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const cart = await openCartByToken(createAdminClient(), store.id, token);
  if (!cart) notFound();

  if (!cart.items.length) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Seu carrinho</h1>
        <p className="text-neutral-700">Os produtos que você tinha separado esgotaram ou saíram da loja.</p>
        <Link href="/" className="inline-block rounded-lg px-5 py-3 font-semibold text-white" style={{ background: "var(--brand)" }}>
          Ver outros produtos
        </Link>
      </div>
    );
  }
  return <RestoreCart token={token} items={cart.items} prefill={{ name: cart.name ?? "", email: cart.email, phone: cart.phone ?? "", cep: "", address: null }} />;
}
