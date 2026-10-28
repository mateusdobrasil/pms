import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatDateTime, formatPhone } from "@/lib/format";
import { CART_STATES, cartState } from "@/lib/abandoned-cart";
import type { CartItem } from "@/lib/cart";

export const metadata = { title: "Carrinhos abandonados · Painel" };

type Row = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  items: CartItem[];
  updated_at: string;
  notified_at: string | null;
  notified_whatsapp: boolean;
  recovered_at: string | null;
  converted_at: string | null;
  converted_order_id: string | null;
  opted_out_at: string | null;
};
type Variant = { id: string; name: string; price_cents: number; products: { name: string } | null };

const DAYS = 30;

// Quem informou o e-mail no checkout e não finalizou (últimos 30 dias), com o que aconteceu depois.
export default async function AbandonedCartsPage() {
  const { supabase, store } = await requireStore("vendas");
  const since = new Date(new Date().getTime() - DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("abandoned_carts")
    .select("id, email, name, phone, items, updated_at, notified_at, notified_whatsapp, recovered_at, converted_at, converted_order_id, opted_out_at")
    .eq("store_id", store.id)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(200);
  const { data: setting } = await supabase.from("stores").select("abandoned_cart_enabled").eq("id", store.id).maybeSingle();
  const carts = (data ?? []) as Row[];

  // Nome e preço de agora de cada variante (só para mostrar; o checkout recalcula tudo).
  const ids = [...new Set(carts.flatMap((c) => c.items.map((i) => i.variantId)))];
  const { data: variants } = ids.length
    ? await supabase.from("product_variants").select("id, name, price_cents, products(name)").eq("store_id", store.id).in("id", ids)
    : { data: [] };
  const byId = new Map(((variants ?? []) as unknown as Variant[]).map((v) => [v.id, v]));
  const describe = (items: CartItem[]) =>
    items.map((i) => {
      const v = byId.get(i.variantId);
      return { label: v ? `${i.quantity}× ${v.products?.name ?? "Produto"}${v.name !== "Único" ? ` · ${v.name}` : ""}` : `${i.quantity}× produto removido`, cents: v ? v.price_cents * i.quantity : 0 };
    });

  const waiting = carts.filter((c) => cartState(c) === "waiting").length;
  const reminded = carts.filter((c) => c.notified_at).length;
  const boughtAfter = carts.filter((c) => c.notified_at && c.converted_at && c.converted_at > c.notified_at).length;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link href="/painel/pedidos" className="text-sm text-neutral-500 hover:underline">← Pedidos</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Carrinhos abandonados</h1>
        <p className="text-sm text-neutral-600">
          Quem informou o e-mail no checkout e não finalizou, nos últimos {DAYS} dias. Uma hora depois, a loja manda um lembrete com o botão que refaz o
          carrinho. Uma mensagem sua no WhatsApp também ajuda.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">O carrinho abandonado está sendo instalado na sua loja. Volte em alguns minutos.</p>
      ) : (
        <>
          {setting && !(setting as { abandoned_cart_enabled?: boolean }).abandoned_cart_enabled && (
            <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Os lembretes estão <strong>desligados</strong>. Os carrinhos aparecem aqui, mas ninguém recebe e-mail. Ligue em Configurações → Carrinho abandonado.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Carrinhos", carts.length],
              ["Lembretes enviados", reminded],
              ["Voltaram pelo lembrete", carts.filter((c) => c.recovered_at).length],
              ["Compraram depois do lembrete", boughtAfter],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="text-2xl font-semibold">{n}</p>
              </div>
            ))}
          </div>

          {carts.length === 0 ? (
            <p className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">Nenhum carrinho abandonado nos últimos {DAYS} dias.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
              {carts.map((c) => {
                const st = CART_STATES[cartState(c)];
                const lines = describe(c.items);
                const total = lines.reduce((s, l) => s + l.cents, 0);
                return (
                  <li key={c.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{c.name ?? c.email}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${st.tone}`}>{st.label}</span>
                    </div>
                    <p className="text-neutral-600">{lines.map((l) => l.label).join(", ")} · {formatBRL(total)}</p>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span>{formatDateTime(c.updated_at)}</span>
                      {c.name && <span>{c.email}</span>}
                      {c.notified_at && <span>lembrete {c.notified_whatsapp ? "por e-mail e WhatsApp" : "por e-mail"} em {formatDateTime(c.notified_at)}</span>}
                      {c.converted_order_id && (
                        <Link href={`/painel/pedidos/${c.converted_order_id}`} className="font-medium text-primary-700 hover:underline">ver pedido</Link>
                      )}
                      {c.phone && !c.converted_at && (
                        <a href={`https://wa.me/55${c.phone}`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">
                          {formatPhone(c.phone)} · WhatsApp
                        </a>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-neutral-500">
            {waiting > 0 && `${waiting} ${waiting === 1 ? "carrinho aguardando" : "carrinhos aguardando"} o lembrete. `}O lembrete sai uma vez só, entre 8h e 22h, e não vai para quem fez pedido depois ou pediu para
            não receber.
          </p>
        </>
      )}
    </div>
  );
}
