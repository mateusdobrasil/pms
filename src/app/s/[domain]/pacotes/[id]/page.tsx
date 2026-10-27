import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { perSessionCents } from "@/lib/packages";
import { packagesForSale } from "@/lib/packages-server";
import { PayLinkForm } from "../../pagar/[token]/pay-link-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comprar pacote", robots: { index: false } };

// Compra do pacote: o cliente vê o que leva, informa os dados (o celular é o que liga o pacote a ele) e paga.
export default async function BuyPackagePage({ params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain, id } = await params;
  if (!isUuid(id)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const p = (await packagesForSale(createAdminClient(), store.id)).find((x) => x.id === id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link href="/pacotes" className="text-sm text-neutral-500 underline">← Pacotes</Link>
      <section className="rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-neutral-500">Pacote · {store.name}</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{p.name}</h1>
        <p className="text-neutral-600">{p.sessions} sessões de {p.service_name}</p>
        <p className="mt-3 text-4xl font-bold tracking-tight">{formatBRL(p.price_cents)}</p>
        <p className="mt-1 text-sm text-emerald-700">{formatBRL(perSessionCents(p.price_cents, p.sessions))} por sessão · {p.validity_days ? `vale ${p.validity_days} dias` : "sem validade"}</p>
        <p className="mt-2 text-sm text-neutral-500">Pix ou cartão de crédito</p>
      </section>
      <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        Use sempre <strong>este mesmo celular</strong> ao agendar: assim o sistema reconhece o seu pacote e não cobra sinal.
      </p>
      <PayLinkForm endpoint={`/api/packages/${p.id}`} />
    </div>
  );
}
