import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isUuid } from "@/lib/validation";
import { storeBaseUrl } from "@/lib/urls";
import { removeDomain, removeMember, setPrimaryDomain, setStoreStatus } from "../../actions";
import { AddDomainForm, AddMemberForm, SecretsForm } from "../../forms";

export default async function AdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireAdmin();

  const [{ data: store }, { data: secret }, { data: members }] = await Promise.all([
    db.from("stores").select("id, name, slug, status, email, origin_zip, store_domains(domain, is_primary)").eq("id", id).maybeSingle(),
    db
      .from("store_secrets")
      .select("gateway_access_token, gateway_public_key, gateway_webhook_secret, melhor_envio_token")
      .eq("store_id", id)
      .maybeSingle(),
    db.from("store_members").select("user_id, role, created_at").eq("store_id", id),
  ]);
  if (!store) notFound();

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
  const configured = Object.fromEntries(Object.entries(secret ?? {}).map(([k, v]) => [k, !!v]));
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
          <SecretsForm storeId={store.id} configured={configured} originZip={store.origin_zip} />
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
