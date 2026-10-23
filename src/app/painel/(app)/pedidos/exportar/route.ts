import { requireStore } from "@/lib/panel";
import { formatCPF, formatPhone } from "@/lib/format";
import { ORDER_STATUSES, SOLD_STATUSES, statusLabel, type OrderStatus } from "@/lib/order-status";
import { FEE_FIELDS, paymentFees } from "@/lib/payments/fees";

const BATCH = 1000; // máximo por consulta no Supabase
const MAX_ROWS = 20000;

type Row = {
  code: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  customer_name: string;
  customer_email: string;
  customer_cpf: string;
  customer_phone: string | null;
  shipping_method: string;
  shipping_address: Record<string, string> | null;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  tracking_code: string | null;
  order_items: { product_name: string; variant_name: string; quantity: number }[];
  payments: { status: string; amount_cents: number; fee: unknown; net: unknown }[];
};

// Planilha para o Excel em português: separador ";", vírgula decimal e BOM para os acentos.
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", "") : "";

// Exporta os pedidos com o mesmo filtro da lista (status e busca por código), todas as páginas.
export async function GET(req: Request) {
  const { supabase, store } = await requireStore();
  const sp = new URL(req.url).searchParams;
  const status = ORDER_STATUSES.includes(sp.get("status") as OrderStatus) ? (sp.get("status") as OrderStatus) : null;
  const q = (sp.get("q") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    let query = supabase
      .from("orders")
      .select(
        `code, status, created_at, paid_at, customer_name, customer_email, customer_cpf, customer_phone, shipping_method, shipping_address, subtotal_cents, shipping_cents, discount_cents, total_cents, tracking_code, order_items(product_name, variant_name, quantity), payments(status, amount_cents, ${FEE_FIELDS})`,
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    query = status ? query.eq("status", status) : query.neq("status", "expired");
    if (q) query = query.ilike("code", `%${q}%`);
    const { data, error } = await query;
    if (error) return new Response("Não foi possível exportar os pedidos. Tente de novo.", { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < BATCH) break;
  }

  const header = [
    "Pedido", "Data", "Status", "Pago em", "Cliente", "E-mail", "CPF", "Telefone", "Itens",
    "Entrega", "Endereço", "Bairro", "Cidade", "UF", "CEP", "Subtotal", "Frete", "Desconto", "Total", "Taxa Mercado Pago", "Valor líquido", "Rastreio",
  ];
  const lines = rows.map((o) => {
    const a = o.shipping_address;
    // Só vendas (pedido cancelado/estornado não tem valor a receber).
    const approved = SOLD_STATUSES.includes(o.status) ? o.payments.find((p) => p.status === "approved") : undefined;
    const fees = approved ? paymentFees(approved.amount_cents, approved.fee, approved.net) : null;
    const items = o.order_items
      .map((i) => `${i.quantity}x ${i.product_name}${i.variant_name !== "Único" ? ` (${i.variant_name})` : ""}`)
      .join("; ");
    return [
      o.code,
      dateTime(o.created_at),
      statusLabel(o.status, o.shipping_method),
      dateTime(o.paid_at),
      o.customer_name,
      o.customer_email,
      formatCPF(o.customer_cpf),
      o.customer_phone ? formatPhone(o.customer_phone) : "",
      items,
      o.shipping_method === "pickup" ? "Retirada na loja" : o.shipping_method,
      a ? [a.street, a.number, a.complement].filter(Boolean).join(", ") : "",
      a?.district,
      a?.city,
      a?.state,
      a?.cep,
      money(o.subtotal_cents),
      money(o.shipping_cents),
      money(o.discount_cents),
      money(o.total_cents),
      fees ? money(fees.feeCents) : "",
      fees ? money(fees.netCents) : "",
      o.tracking_code,
    ].map(cell).join(";");
  });

  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${store.slug}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
