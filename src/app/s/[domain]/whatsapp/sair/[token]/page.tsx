import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { OptOutButton } from "./opt-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novidades pelo WhatsApp", robots: { index: false } };

// Página do link "para não receber mais" das campanhas no WhatsApp.
export default async function OptOutPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const { data } = await createAdminClient().from("whatsapp_optins").select("opted_out_at").eq("store_id", store.id).eq("token", token).maybeSingle();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4 py-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Novidades pelo WhatsApp</h1>
      {data.opted_out_at ? (
        <p className="text-neutral-700">Pronto: você não recebe mais novidades e promoções da {store.name} pelo WhatsApp.</p>
      ) : (
        <>
          <p className="text-neutral-700">Não quer mais receber novidades e promoções da {store.name} pelo WhatsApp?</p>
          <OptOutButton token={token} storeName={store.name} />
        </>
      )}
      <p className="text-xs text-neutral-500">Os avisos dos seus pedidos e agendamentos continuam chegando normalmente.</p>
    </div>
  );
}
