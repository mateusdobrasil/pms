import { notFound } from "next/navigation";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin";
import { isUuid } from "@/lib/validation";
import { formatBRL } from "@/lib/money";
import { BILLING, formatDay, todayBR } from "@/lib/billing";
import { PLATFORM_CONTACT, platformWhatsappUrl } from "@/lib/platform";
import { PROPOSAL_FIELDS, type Proposal, proposalItems } from "@/lib/proposals";
import { acceptProposal } from "./actions";
import { PrintButton } from "./print-button";
import { TERMS_PATH } from "@/lib/terms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta comercial · PMS app", robots: { index: false, follow: false } };

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });

export default async function PublicProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ termos?: string }>;
}) {
  const { token } = await params;
  const missingTerms = !!(await searchParams).termos;
  if (!isUuid(token)) notFound();
  const db = createAdminClient();
  const { data } = await db.from("proposals").select(PROPOSAL_FIELDS).eq("public_token", token).maybeSingle();
  if (!data) notFound();
  const p = data as Proposal;

  // Primeira abertura pelo cliente (o admin conferindo não conta).
  if (!p.viewed_at && (await getAdminSession()).status !== "admin") {
    await db.from("proposals").update({ viewed_at: new Date().toISOString() }).eq("id", p.id).is("viewed_at", null);
  }

  const expired = !p.accepted_at && p.valid_until < todayBR();
  const items = proposalItems(p.items);
  const whatsapp = platformWhatsappUrl(`Olá! Recebi a proposta da loja virtual para a ${p.business_name} e tenho uma dúvida.`);

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-primary-900 px-8 py-6 text-white print:bg-white print:py-2 print:text-neutral-900">
          <div className="flex items-center gap-3">
            <Image src="/brand/icon-96.png" alt="PMS app" width={48} height={48} className="rounded-lg" />
            <div className="leading-tight">
              <p className="text-lg font-bold">PMS app</p>
              <p className="text-sm text-primary-200 print:text-neutral-500">Lojas virtuais prontas para vender</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Proposta comercial</p>
            <p className="text-primary-200 print:text-neutral-500">{longDate(p.created_at)}</p>
          </div>
        </header>

        <div className="space-y-8 px-8 py-8 print:space-y-5 print:py-4">
          <section>
            <p className="text-sm text-neutral-500">Preparada para</p>
            <h1 className="text-2xl font-bold tracking-tight">{p.business_name}</h1>
            <p className="text-neutral-600">A/C {p.client_name}</p>
            <p className="mt-4 text-neutral-700">
              Uma loja virtual completa, no domínio da sua marca, pronta para vender com Pix e cartão. Nós cuidamos da tecnologia, da hospedagem
              e das atualizações; você cuida dos produtos e das vendas.
            </p>
          </section>

          {items.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">O que está incluído</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-neutral-700">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Investimento</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-5 print:break-inside-avoid">
                <p className="text-sm text-neutral-500">Implantação</p>
                <p className="text-2xl font-bold">{p.setup_fee_cents ? formatBRL(p.setup_fee_cents) : "Isenta"}</p>
                <p className="text-sm text-neutral-500">pagamento único: criação e configuração da loja</p>
              </div>
              <div className="rounded-xl border p-5 print:break-inside-avoid">
                <p className="text-sm text-neutral-500">Mensalidade</p>
                <p className="text-2xl font-bold">{p.monthly_fee_cents ? formatBRL(p.monthly_fee_cents) : "Isenta"}</p>
                <p className="text-sm text-neutral-500">{p.monthly_fee_cents ? `vence todo dia ${BILLING.dueDay}: hospedagem, suporte e atualizações` : "hospedagem, suporte e atualizações"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-neutral-600">
              Pagamento por Pix, cartão ou boleto. Sem comissão sobre as vendas: as taxas de pagamento são as do Mercado Pago, na sua própria conta.
            </p>
          </section>

          {p.notes && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Condições</h2>
              <p className="whitespace-pre-line text-sm text-neutral-700">{p.notes}</p>
            </section>
          )}

          <section className="rounded-xl bg-neutral-50 p-5 print:p-3">
            {p.accepted_at ? (
              <p className="font-semibold text-emerald-700">
                Proposta aceita em {longDate(p.accepted_at)}. Obrigado! Vamos falar com você para começar a sua loja.
              </p>
            ) : expired ? (
              <p className="text-neutral-700">
                Esta proposta venceu em {formatDay(p.valid_until)}. Fale com a gente para receber uma atualizada.
              </p>
            ) : (
              <p className="text-neutral-700">
                Proposta válida até <strong>{formatDay(p.valid_until)}</strong>.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 print:hidden">
              {!p.accepted_at && !expired && (
                <form action={acceptProposal} className="w-full space-y-3">
                  <input type="hidden" name="token" value={p.public_token} />
                  <label className="flex items-start gap-2 text-sm text-neutral-700">
                    <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4" />
                    <span>
                      Li e concordo com os{" "}
                      <a href={TERMS_PATH} target="_blank" rel="noopener" className="font-medium text-primary-700 underline">
                        Termos de uso
                      </a>{" "}
                      da PMS app.
                    </span>
                  </label>
                  {missingTerms && <p className="text-sm text-red-700">Para aceitar, marque que leu e concorda com os Termos de uso.</p>}
                  <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                    Aceitar proposta
                  </button>
                </form>
              )}
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700">
                Tirar dúvidas no WhatsApp
              </a>
              <PrintButton />
            </div>
          </section>
        </div>

        <footer className="border-t px-8 py-5 text-sm text-neutral-500 print:py-2">
          PMS app · WhatsApp e telefone {PLATFORM_CONTACT.phoneDisplay} · {PLATFORM_CONTACT.email} · www.pmsapp.dev
        </footer>
      </article>
    </div>
  );
}
