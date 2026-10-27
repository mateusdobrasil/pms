import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { linkState } from "@/lib/payment-links";
import { getPaymentLink } from "@/lib/payment-links-server";
import { PayLinkForm } from "./pay-link-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagamento", robots: { index: false } };

// Link de pagamento avulso: o cliente vê o que está pagando, informa os dados e segue para o Pix/cartão.
export default async function PayLinkPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const link = await getPaymentLink(createAdminClient(), store.id, token);
  if (!link) notFound();

  const state = linkState(link);
  const unavailable = {
    paid: { title: "Este link já foi pago", text: "O pagamento foi confirmado. Obrigado!" },
    expired: { title: "Este link venceu", text: "Peça um link novo à loja." },
    canceled: { title: "Este link foi cancelado", text: "Fale com a loja para combinar o pagamento." },
    active: null,
  }[state];

  return (
    <div className="mx-auto max-w-md space-y-6">
      <section className="rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-neutral-500">Pagamento para {store.name}</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{link.title}</h1>
        <p className="mt-3 text-4xl font-bold tracking-tight">{formatBRL(link.amount_cents)}</p>
        <p className="mt-2 text-sm text-neutral-500">Pix ou cartão de crédito</p>
      </section>

      {unavailable ? (
        <section className="rounded-xl border bg-neutral-50 p-5 text-center">
          <h2 className="font-semibold">{unavailable.title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{unavailable.text}</p>
          {store.whatsapp && state !== "paid" && (
            <a
              href={`https://wa.me/${store.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Falar com a loja no WhatsApp
            </a>
          )}
        </section>
      ) : (
        <PayLinkForm endpoint={`/api/payment-links/${token}`} />
      )}
    </div>
  );
}
