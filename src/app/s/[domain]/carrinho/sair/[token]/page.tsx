import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { CartOptOutButton } from "./opt-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lembretes de carrinho", robots: { index: false } };

// Link "não quero receber lembretes de carrinho" do e-mail.
export default async function CartOptOutPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const { data } = await createAdminClient().from("abandoned_carts").select("opted_out_at").eq("store_id", store.id).eq("token", token).maybeSingle();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4 py-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Lembretes de carrinho</h1>
      {data.opted_out_at ? (
        <p className="text-neutral-700">Pronto: você não recebe mais lembretes de carrinho da {store.name}.</p>
      ) : (
        <>
          <p className="text-neutral-700">Não quer mais receber lembretes quando deixar produtos no carrinho da {store.name}?</p>
          <CartOptOutButton token={token} storeName={store.name} />
        </>
      )}
      <p className="text-xs text-neutral-500">Os e-mails dos seus pedidos continuam chegando normalmente.</p>
    </div>
  );
}
