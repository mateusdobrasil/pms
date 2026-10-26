// Clientes da loja (Painel → Clientes), montados a partir dos pedidos pagos e dos agendamentos.
// Sem tabela de clientes: a mesma pessoa é reconhecida pelo celular ou pelo e-mail.

export type Activity = {
  kind: "order" | "booking";
  name: string;
  phone: string | null;
  email: string | null;
  at: string; // pagamento do pedido ou horário do agendamento
  cents: number;
};

export type Customer = {
  key: string; // celular (só dígitos) ou e-mail: liga o cliente às marcações do lojista (customer_contacts)
  name: string;
  phone: string | null;
  email: string | null;
  orders: number;
  bookings: number;
  totalCents: number;
  lastAt: string;
  nextBookingAt: string | null; // já tem horário marcado: não sumiu
};

// Celular sem o 55 e só com dígitos (10 ou 11); outro formato não serve para o WhatsApp.
export function normalizePhone(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11 ? d : null;
}

const normalizeEmail = (email: string | null | undefined) => {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
};

// Agrupa por celular OU e-mail (quem comprou com e-mail e agendou com celular e e-mail vira um cliente só).
export function groupCustomers(activities: Activity[], upcoming: { phone: string | null; email: string | null; at: string }[] = []): Customer[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const keysOf = (phone: string | null, email: string | null) =>
    [normalizePhone(phone) && `t:${normalizePhone(phone)}`, normalizeEmail(email) && `e:${normalizeEmail(email)}`].filter(Boolean) as string[];

  const rows = activities.map((a) => ({ a, keys: keysOf(a.phone, a.email) })).filter((r) => r.keys.length);
  for (const { keys } of rows) {
    for (const k of keys) if (!parent.has(k)) parent.set(k, k);
    if (keys.length === 2) union(keys[0], keys[1]);
  }

  // Mais recente primeiro: nome, celular e e-mail do cliente são os da última compra/visita.
  rows.sort((x, y) => y.a.at.localeCompare(x.a.at));
  const byRoot = new Map<string, Customer>();
  for (const { a, keys } of rows) {
    const root = find(keys[0]);
    let c = byRoot.get(root);
    if (!c) {
      c = { key: "", name: a.name, phone: null, email: null, orders: 0, bookings: 0, totalCents: 0, lastAt: a.at, nextBookingAt: null };
      byRoot.set(root, c);
    }
    c.phone ??= normalizePhone(a.phone);
    c.email ??= normalizeEmail(a.email);
    if (a.kind === "order") c.orders++;
    else c.bookings++;
    c.totalCents += a.cents;
  }

  for (const u of upcoming) {
    const keys = keysOf(u.phone, u.email).filter((k) => parent.has(k));
    const c = keys.length ? byRoot.get(find(keys[0])) : undefined;
    if (c && (!c.nextBookingAt || u.at < c.nextBookingAt)) c.nextBookingAt = u.at;
  }

  return [...byRoot.values()].map((c) => ({ ...c, key: c.phone ?? c.email! }));
}

export const daysSince = (iso: string, now = new Date()) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);

export const AWAY_DAYS = [30, 60, 90, 180] as const;

export const DEFAULT_MESSAGE = "Oi, {nome}! Aqui é da {loja}. Faz um tempinho que você não aparece e sentimos sua falta 😊 Que tal dar uma passada? {link}";

// Troca {nome}, {loja} e {link} na mensagem do lojista (o nome vai só o primeiro).
export function fillMessage(template: string, values: { name: string; store: string; link: string }) {
  return template
    .replaceAll("{nome}", values.name.trim().split(/\s+/)[0] ?? "")
    .replaceAll("{loja}", values.store)
    .replaceAll("{link}", values.link)
    .trim();
}
