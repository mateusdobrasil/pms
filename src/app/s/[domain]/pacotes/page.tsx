import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { perSessionCents } from "@/lib/packages";
import { packagesForSale } from "@/lib/packages-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pacotes" };

// Pacotes de sessões à venda: paga uma vez e cada atendimento desconta uma sessão.
export default async function PackagesStorePage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const packages = await packagesForSale(createAdminClient(), store.id);
  if (!packages.length) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Pacotes</h1>
        <p className="text-neutral-600">Pague uma vez e use quando quiser: cada atendimento desconta uma sessão. Com pacote, você agenda sem pagar sinal.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {packages.map((p) => (
          <Link key={p.id} href={`/pacotes/${p.id}`} className="block rounded-xl border-2 border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400">
            <p className="text-lg font-semibold">{p.name}</p>
            <p className="text-neutral-600">{p.sessions} sessões de {p.service_name}</p>
            <p className="mt-3 text-2xl font-bold">{formatBRL(p.price_cents)}</p>
            <p className="text-sm text-emerald-700">{formatBRL(perSessionCents(p.price_cents, p.sessions))} por sessão</p>
            <p className="mt-1 text-xs text-neutral-500">{p.validity_days ? `Vale ${p.validity_days} dias a partir da compra` : "Sem validade"}</p>
            <span className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand)" }}>Comprar</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
