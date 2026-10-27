import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GatewayPayment } from "@/lib/payments/mercadopago";

// after() e e-mails ficam de fora: aqui só interessa o que é gravado no banco.
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/email", () => ({ notifyOrderPaid: vi.fn(), notifyPlatformError: vi.fn() }));

const { amountFor, recordPayment } = await import("@/lib/payments/record");

// Banco falso: registra as escritas e responde sem erro.
function fakeDb() {
  const calls: { table: string; op: string; values?: unknown; filters: [string, unknown][] }[] = [];
  const chain = (table: string, op: string, values?: unknown) => {
    const call = { table, op, values, filters: [] as [string, unknown][] };
    calls.push(call);
    const builder = {
      eq(col: string, val: unknown) {
        call.filters.push([col, val]);
        return builder;
      },
      then(resolve: (r: { error: null }) => void) {
        resolve({ error: null });
      },
    };
    return builder;
  };
  const db = {
    from: (table: string) => ({
      upsert: (values: unknown) => chain(table, "upsert", values),
      update: (values: unknown) => chain(table, "update", values),
    }),
    rpc: (name: string, args: unknown) => chain(name, "rpc", args),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const order = {
  id: "0d01067f-81bf-44a4-9f8b-f24b0fd38a95",
  store_id: "d33591ca-0c90-4f18-a082-e2f5a638aedb",
  status: "pending_payment",
  subtotal_cents: 7990,
  shipping_cents: 1000,
  pix_discount_cents: 799,
};

const payment = (over: Partial<GatewayPayment>): GatewayPayment =>
  ({ id: "123", orderId: order.id, method: "pix", status: "approved", amountCents: 8191, raw: {}, ...over }) as GatewayPayment;

describe("amountFor", () => {
  it("Pix cobra subtotal + frete - desconto; cartão cobra o valor cheio", () => {
    expect(amountFor(order, "pix")).toBe(7990 + 1000 - 799);
    expect(amountFor(order, "card")).toBe(7990 + 1000);
  });

  it("sem desconto, os dois valores são iguais", () => {
    const noDiscount = { ...order, pix_discount_cents: 0 };
    expect(amountFor(noDiscount, "pix")).toBe(amountFor(noDiscount, "card"));
  });
});

describe("recordPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa pagamento com valor diferente do esperado (sem gravar nada)", async () => {
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, order, payment({ amountCents: 8990 }))).toBe(false); // Pix pelo valor cheio
    expect(await recordPayment(db, order, payment({ method: "card", amountCents: 8191 }))).toBe(false); // cartão com desconto
    expect(calls).toHaveLength(0);
  });

  it("recusa pagamento de outro pedido", async () => {
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, order, payment({ orderId: "outro" }))).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("Pix aprovado: confirma o pedido e grava o desconto e o total pago, uma vez só", async () => {
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, order, payment({}))).toBe(true);

    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(["payments:upsert", "confirm_order_payment:rpc", "orders:update"]);
    const update = calls[2];
    expect(update.values).toEqual({ total_cents: 8191, discount_cents: 799 });
    // Trava contra desconto em dobro: só atualiza se ainda não tinha desconto.
    expect(update.filters).toContainEqual(["discount_cents", 0]);
  });

  it("Pix aprovado num pedido que já estava pago (pagamento em dobro): não mexe no total", async () => {
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, { ...order, status: "paid" }, payment({}))).toBe(true);
    expect(calls.some((c) => c.table === "orders")).toBe(false);
  });

  it("Pix aprovado depois de expirar ainda aplica o desconto", async () => {
    const { db, calls } = fakeDb();
    await recordPayment(db, { ...order, status: "expired" }, payment({}));
    expect(calls.some((c) => c.table === "orders" && c.op === "update")).toBe(true);
  });

  it("cartão aprovado: confirma sem desconto", async () => {
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, order, payment({ method: "card", amountCents: 8990 }))).toBe(true);
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(["payments:upsert", "confirm_order_payment:rpc"]);
  });

  it("com cupom: os dois valores já saem com o cupom; no Pix, o desconto total soma cupom e Pix", async () => {
    // Produtos 79,90 − cupom 10,00 = 69,90; Pix 10% sobre 69,90 = 6,99; frete 10,00.
    const withCoupon = { ...order, coupon_discount_cents: 1000, pix_discount_cents: 699 };
    expect(amountFor(withCoupon, "card")).toBe(7990 + 1000 - 1000);
    expect(amountFor(withCoupon, "pix")).toBe(7990 + 1000 - 1000 - 699);
    const { db, calls } = fakeDb();
    expect(await recordPayment(db, withCoupon, payment({ amountCents: 7291 }))).toBe(true);
    const update = calls.find((c) => c.table === "orders")!;
    expect(update.values).toEqual({ total_cents: 7291, discount_cents: 1699 });
    expect(update.filters).toContainEqual(["discount_cents", 1000]); // só se ainda tinha só o cupom
    // Cartão pelo valor sem cupom é recusado.
    expect(await recordPayment(fakeDb().db, withCoupon, payment({ method: "card", amountCents: 8990 }))).toBe(false);
  });

  it("pagamento pendente: só registra, não confirma", async () => {
    const { db, calls } = fakeDb();
    await recordPayment(db, order, payment({ status: "pending" }));
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(["payments:upsert"]);
  });
});
