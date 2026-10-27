import { requireStore } from "@/lib/panel";
import { storeBaseUrl } from "@/lib/urls";
import { type Coupon, couponConditions, couponLabel, couponStatus } from "@/lib/coupons";
import { COUPON_FIELDS, couponUseCounts } from "@/lib/coupons-server";
import { LinkShare } from "../links/link-share";
import { deleteCoupon, setCouponActive } from "./actions";
import { CouponForm } from "./coupon-form";

export const metadata = { title: "Cupons · PMS app" };

const TONE = { on: "bg-emerald-100 text-emerald-800", off: "bg-neutral-100 text-neutral-600", wait: "bg-amber-100 text-amber-800" };

// Cupons de desconto da loja virtual: o cliente digita no checkout ou chega por um link com o cupom.
export default async function CouponsPage() {
  const { supabase, store } = await requireStore();
  const [{ data: rows, error }, { data: domains }] = await Promise.all([
    supabase.from("coupons").select(COUPON_FIELDS).eq("store_id", store.id).order("created_at", { ascending: false }),
    supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id),
  ]);
  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
  const baseUrl = domain ? storeBaseUrl(domain) : null;

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cupons</h1>
        <p className="text-sm text-neutral-600">Este recurso está sendo instalado. Volte em alguns minutos.</p>
      </div>
    );
  }
  const coupons = (rows ?? []) as Coupon[];
  const uses = coupons.length ? await couponUseCounts(supabase, store.id) : new Map<string, number>();
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cupons</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Desconto nos produtos da loja virtual (o frete não tem desconto). O cliente digita o código no checkout ou chega por um link que já aplica o cupom:
          bom para posts, stories e campanhas. Se a loja dá desconto no Pix, ele vale por cima, sobre o valor já com o cupom.
        </p>
      </div>

      <CouponForm />

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-medium">Seus cupons</h2>
        {coupons.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Nenhum cupom ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {coupons.map((c) => {
              const used = uses.get(c.id) ?? 0;
              const status = couponStatus(c, now, used);
              const link = baseUrl ? `${baseUrl}/?cupom=${c.code}` : null;
              return (
                <li key={c.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-base font-semibold">{c.code}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status.tone]}`}>{status.label}</span>
                      <span className="block text-neutral-600">
                        {couponLabel(c)}
                        {couponConditions(c).map((t) => ` · ${t}`)}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        Usado {used} {used === 1 ? "vez" : "vezes"}
                        {c.max_uses ? ` de ${c.max_uses}` : ""} (pedidos pagos e aguardando pagamento)
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <form action={setCouponActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <button type="submit" className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:border-neutral-400">
                          {c.active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={deleteCoupon}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="rounded-md border px-2.5 py-1.5 text-xs font-medium text-red-700 hover:border-red-300" title={used ? "Já usado: fica desativado" : undefined}>
                          Excluir
                        </button>
                      </form>
                    </span>
                  </div>
                  {link && c.active && (
                    <LinkShare url={link} whatsappText={`Cupom ${c.code}: ${couponLabel(c)} na ${store.name}! Use no site: ${link}`} compact />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
