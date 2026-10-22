import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isUuid } from "@/lib/validation";
import { storeBaseUrl } from "@/lib/urls";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { daysLate, dueDateOptions, formatDay, invoiceTitle, todayBR } from "@/lib/billing";
import { INVOICE_FIELDS, type InvoiceRow } from "@/lib/billing-server";
import { cancelInvoice, markInvoicePaid, removeDomain, removeMember, setPrimaryDomain, setStoreStatus } from "../../actions";
import { AddDomainForm, AddMemberForm, BillingForm, BrandingForm, SecretsForm } from "../../forms";

export default async function AdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireAdmin();

  const [{ data: store }, { data: secret }, { data: members }] = await Promise.all([
    db.from("stores").select("id, name, slug, status, email, origin_zip, logo_url, primary_color, store_domains(domain, is_primary)").eq("id", id).maybeSingle(),
    db
      .from("store_secrets")
      .select("*") // "*": tolera a coluna melhor_envio_sandbox ainda não existir
      .eq("store_id", id)
      .maybeSingle(),
    db.from("store_members").select("user_id, role, created_at").eq("store_id", id),
  ]);
  if (!store) notFound();

  // Cobrança: colunas e tabela do SQL 20261024000000, lidas à parte (sem o SQL, a seção avisa).
  const [{ data: billing, error: billingError }, { data: invoiceRows }] = await Promise.all([
    db.from("stores").select("setup_fee_cents, monthly_fee_cents, billing_starts_on, suspended_for_billing").eq("id", id).single(),
    db.from("store_invoices").select(INVOICE_FIELDS).eq("store_id", id).order("due_date", { ascending: false }),
  ]);
  const invoices = (invoiceRows ?? []) as InvoiceRow[];
  const today = todayBR();
  const dueValues = dueDateOptions(today, 4);
  if (billing?.billing_starts_on && !dueValues.includes(billing.billing_starts_on)) dueValues.unshift(billing.billing_starts_on);

  // E-mails dos membros (auth.users só é acessível pela API admin).
  const memberRows = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await db.auth.admin.getUserById(m.user_id);
      return { ...m, email: data.user?.email ?? m.user_id, lastSignIn: data.user?.last_sign_in_at ?? null };
    }),
  );

  const domains = [...(store.store_domains as { domain: string; is_primary: boolean }[])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  // Só "configurado ou não": os valores nunca vão para a página.
  const SECRET_KEYS = ["gateway_access_token", "gateway_public_key", "gateway_webhook_secret", "melhor_envio_token"];
  const configured = Object.fromEntries(SECRET_KEYS.map((k) => [k, !!secret?.[k]]));
  const meSandbox: boolean = secret?.melhor_envio_sandbox ?? true;
  const mpTest = String(secret?.gateway_access_token ?? "").startsWith("TEST-");
  const card = "space-y-4 rounded-xl border bg-white p-5 shadow-sm";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-neutral-500 underline">← Lojas</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              store.status === "active" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-red-100 text-red-800 ring-red-200"
            }`}
          >
            {store.status === "active" ? "Ativa" : "Suspensa"}
          </span>
        </div>
        <p className="text-sm text-neutral-500">Identificador: {store.slug}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Identidade</h2>
          <BrandingForm storeId={store.id} name={store.name} color={store.primary_color} logoUrl={store.logo_url} />
        </section>

        <section className={card}>
          <h2 className="font-semibold">Domínios</h2>
          {domains.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum domínio. A loja só abre depois de vincular um.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {domains.map((d) => (
                <li key={d.domain} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <a href={storeBaseUrl(d.domain)} target="_blank" rel="noopener noreferrer" className="flex-1 font-medium text-primary-700 hover:underline">
                    {d.domain}
                  </a>
                  {d.is_primary ? (
                    <span className="text-xs text-neutral-500">principal</span>
                  ) : (
                    <form action={setPrimaryDomain}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="domain" value={d.domain} />
                      <button className="text-xs underline">tornar principal</button>
                    </form>
                  )}
                  <form action={removeDomain}>
                    <input type="hidden" name="storeId" value={store.id} />
                    <input type="hidden" name="domain" value={d.domain} />
                    <button className="text-xs text-red-700 underline">remover</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddDomainForm storeId={store.id} />
          <p className="text-xs text-neutral-500">
            Depois de vincular, adicione o domínio em Vercel → Settings → Domains e aponte o DNS (CNAME para
            cname.vercel-dns.com, ou registro A para o domínio sem www).
          </p>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Usuários do painel</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {memberRows.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1">
                  {m.email}
                  <span className="block text-xs text-neutral-500">
                    {m.lastSignIn ? `último acesso ${new Date(m.lastSignIn).toLocaleDateString("pt-BR")}` : "nunca entrou"}
                  </span>
                </span>
                <form action={removeMember}>
                  <input type="hidden" name="storeId" value={store.id} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <button className="text-xs text-red-700 underline">remover</button>
                </form>
              </li>
            ))}
            {memberRows.length === 0 && <li className="px-3 py-2 text-neutral-500">Nenhum usuário.</li>}
          </ul>
          <AddMemberForm storeId={store.id} />
        </section>

        <section className={card}>
          <h2 className="font-semibold">Pagamento e frete</h2>
          <SecretsForm storeId={store.id} configured={configured} originZip={store.origin_zip} meSandbox={meSandbox} />
          {configured.gateway_access_token && (
            <p className={`rounded-lg px-3 py-2 text-xs ${mpTest ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
              Mercado Pago em {mpTest ? "modo de TESTE (credenciais TEST-): nenhum dinheiro real é cobrado." : "PRODUÇÃO: cobranças reais."}
            </p>
          )}
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h2 className="font-semibold">Cobrança</h2>
          {billingError || !billing ? (
            <p className="text-sm text-neutral-500">Rode o SQL 20261024000000_cobranca_mensalidade.sql para ativar a cobrança.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <BillingForm
                storeId={store.id}
                setupFee={billing.setup_fee_cents}
                monthlyFee={billing.monthly_fee_cents}
                startsOn={billing.billing_starts_on}
                dueOptions={dueValues.map((d) => ({ value: d, label: formatDay(d) }))}
              />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-neutral-700">Faturas</h3>
                {billing.suspended_for_billing && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">Suspensa pela cobrança: volta sozinha quando a fatura atrasada for paga.</p>
                )}
                {invoices.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhuma fatura.</p>
                ) : (
                  <ul className="divide-y rounded-lg border text-sm">
                    {invoices.map((inv) => {
                      const late = inv.status === "open" ? daysLate(inv.due_date, today) : 0;
                      return (
                        <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                          <span className="min-w-0 flex-1">
                            {invoiceTitle(inv)} · {formatBRL(inv.amount_cents)}
                            <span className={`block text-xs ${late ? "text-red-700" : "text-neutral-500"}`}>
                              {inv.status === "paid"
                                ? `paga${inv.paid_at ? ` em ${formatDateTime(inv.paid_at)}` : ""}${inv.payment_method ? ` (${inv.payment_method})` : ""}`
                                : inv.status === "canceled"
                                  ? "cancelada"
                                  : `vence ${formatDay(inv.due_date)}${late ? ` · ${late} dia(s) de atraso` : ""}`}
                            </span>
                          </span>
                          {inv.status === "open" && (
                            <>
                              <form action={markInvoicePaid}>
                                <input type="hidden" name="storeId" value={store.id} />
                                <input type="hidden" name="invoiceId" value={inv.id} />
                                <button className="text-xs text-emerald-700 underline">marcar como paga</button>
                              </form>
                              <form action={cancelInvoice}>
                                <input type="hidden" name="storeId" value={store.id} />
                                <input type="hidden" name="invoiceId" value={inv.id} />
                                <button className="text-xs text-red-700 underline">cancelar</button>
                              </form>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold">Situação</h2>
          <p className="text-sm text-neutral-600">
            {store.status === "active"
              ? "A loja está no ar. Suspender tira a vitrine do ar (o painel continua acessível, com aviso)."
              : "A loja está suspensa: a vitrine não abre e os produtos não aparecem."}
          </p>
          <form action={setStoreStatus}>
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="status" value={store.status === "active" ? "suspended" : "active"} />
            <button
              type="submit"
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                store.status === "active" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {store.status === "active" ? "Suspender loja" : "Reativar loja"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
