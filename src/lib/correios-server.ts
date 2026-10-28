import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderDelivered } from "@/lib/email";
import { TRACK_BATCH, deliveredEvent, isCorreiosCode, normalizeTrackingCode, parseTracking, tokenValid, type TrackingEvent } from "@/lib/correios";

// API oficial dos Correios (contrato de cada loja). CORREIOS_API_URL troca para a homologação
// (https://apihom.correios.com.br) em testes.
const BASE = () => process.env.CORREIOS_API_URL || "https://api.correios.com.br";
const LOOKBACK_DAYS = 90; // pedido enviado há mais tempo que isso não é mais consultado
const MAX_ORDERS = 300; // por rodada da rotina

type Secrets = {
  correios_user: string | null;
  correios_access_code: string | null;
  correios_card: string | null;
  correios_token: string | null;
  correios_token_expires_at: string | null;
};

async function readSecrets(db: SupabaseClient, storeId: string): Promise<Secrets | null> {
  const { data, error } = await db
    .from("store_secrets")
    .select("correios_user, correios_access_code, correios_card, correios_token, correios_token_expires_at")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error || !data?.correios_user || !data.correios_access_code) return null; // sem o SQL ou sem contrato
  return data as Secrets;
}

// A loja tem o contrato dos Correios configurado?
export async function correiosConfigured(db: SupabaseClient, storeId: string) {
  return !!(await readSecrets(db, storeId));
}

export class CorreiosError extends Error {}

// Token do contrato (vale 24 h; guardado em store_secrets e renovado 30 min antes de vencer).
// Com cartão de postagem, autentica por ele; sem, só com usuário e código de acesso.
export async function correiosToken(db: SupabaseClient, storeId: string, force = false): Promise<string> {
  const s = await readSecrets(db, storeId);
  if (!s) throw new CorreiosError("Contrato dos Correios não configurado.");
  if (!force && s.correios_token && tokenValid(s.correios_token_expires_at, Date.now())) return s.correios_token;

  const card = s.correios_card?.replace(/\D/g, "");
  const res = await fetch(`${BASE()}/token/v1/autentica${card ? "/cartaopostagem" : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${s.correios_user}:${s.correios_access_code}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: card ? JSON.stringify({ numero: card }) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { token?: string; expiraEm?: string; msgs?: string[] } | null;
  if (!res.ok || !body?.token) {
    const why = body?.msgs?.join(" ") || `HTTP ${res.status}`;
    throw new CorreiosError(res.status === 401 || res.status === 403 ? `Usuário, código de acesso ou cartão de postagem recusado pelos Correios (${why}). O usuário é o nome do login no Meu Correios, não o CPF/CNPJ.` : `Correios não autenticaram (${why}).`);
  }
  // expiraEm vem sem fuso (horário de Brasília); sem ele, assume 23 h.
  const exp = body.expiraEm ? Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(body.expiraEm) ? body.expiraEm : `${body.expiraEm}-03:00`) : NaN;
  const expiresAt = new Date(Number.isNaN(exp) ? Date.now() + 23 * 3_600_000 : exp).toISOString();
  await db.from("store_secrets").update({ correios_token: body.token, correios_token_expires_at: expiresAt }).eq("store_id", storeId);
  return body.token;
}

// Consulta até 50 códigos de uma vez. Token recusado: autentica de novo uma vez.
async function fetchEvents(db: SupabaseClient, storeId: string, codes: string[]): Promise<Map<string, TrackingEvent[]>> {
  const qs = new URLSearchParams(codes.map((c) => ["codigosObjetos", c]));
  qs.set("resultado", "T");
  for (const force of [false, true]) {
    const token = await correiosToken(db, storeId, force);
    const res = await fetch(`${BASE()}/srorastro/v1/objetos?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 && !force) continue;
    if (res.status === 403) {
      // "GTW-012: Acesso não autorizado. API restrita.": a conta não tem a API de rastreio (sem contrato).
      throw new CorreiosError("Os Correios não liberam o rastreio para este acesso (API restrita). O rastreio automático precisa de contrato com os Correios.");
    }
    if (!res.ok) throw new CorreiosError(`Rastreio dos Correios respondeu HTTP ${res.status}.`);
    return parseTracking(await res.json());
  }
  return new Map();
}

type OrderRow = { id: string; store_id: string; status: string; tracking_code: string };

// Grava o histórico e, se entregue, passa o pedido para "Entregue" (só a partir de "Enviado").
async function applyEvents(db: SupabaseClient, order: OrderRow, events: TrackingEvent[] | undefined) {
  const now = new Date().toISOString();
  if (!events) {
    await db.from("orders").update({ tracking_checked_at: now }).eq("id", order.id);
    return false;
  }
  await db.from("orders").update({ tracking_events: events, tracking_checked_at: now }).eq("id", order.id);
  const delivered = deliveredEvent(events);
  if (!delivered || order.status !== "shipped") return false;
  const { data } = await db.from("orders").update({ status: "delivered", delivered_at: delivered.at }).eq("id", order.id).eq("status", "shipped").select("id");
  if (!data?.length) return false;
  await notifyOrderDelivered(order.id); // e-mail e WhatsApp ao cliente (trava notified_delivered_at)
  return true;
}

// Consulta os pedidos de uma loja (em lotes de 50).
async function syncStoreOrders(db: SupabaseClient, storeId: string, orders: OrderRow[]) {
  let delivered = 0;
  for (let i = 0; i < orders.length; i += TRACK_BATCH) {
    const part = orders.slice(i, i + TRACK_BATCH);
    const events = await fetchEvents(db, storeId, [...new Set(part.map((o) => normalizeTrackingCode(o.tracking_code)))]);
    for (const o of part) if (await applyEvents(db, o, events.get(normalizeTrackingCode(o.tracking_code)))) delivered++;
  }
  return delivered;
}

// "Atualizar rastreio" no pedido (e logo depois de salvar o código). Devolve o erro para mostrar ao lojista.
export async function syncOrderTracking(db: SupabaseClient, storeId: string, orderId: string): Promise<{ ok: true; delivered: boolean } | { ok: false; error: string }> {
  const { data: o } = await db.from("orders").select("id, store_id, status, tracking_code").eq("id", orderId).eq("store_id", storeId).maybeSingle();
  if (!o?.tracking_code || !isCorreiosCode(o.tracking_code)) return { ok: false, error: "Este pedido não tem código de rastreio dos Correios." };
  if (!(await correiosConfigured(db, storeId))) return { ok: false, error: "O rastreio automático precisa do contrato dos Correios da loja. Fale com o suporte." };
  try {
    return { ok: true, delivered: (await syncStoreOrders(db, storeId, [o as OrderRow])) > 0 };
  } catch (err) {
    console.error("Rastreio dos Correios falhou", { storeId, orderId, err });
    return { ok: false, error: err instanceof CorreiosError ? err.message : "Os Correios não responderam. Tente de novo em alguns minutos." };
  }
}

// Rotina de hora em hora: pedidos "Enviado" com código dos Correios, de lojas com contrato, não consultados nas
// últimas 3 h. Nunca lança erro (uma loja com problema não para as outras).
export async function syncAllTracking(db: SupabaseClient) {
  const result = { orders: 0, delivered: 0, stores: 0, failed: 0 };
  try {
    const now = Date.now();
    const { data, error } = await db
      .from("orders")
      .select("id, store_id, status, tracking_code, stores!inner(status)")
      .eq("status", "shipped")
      .not("tracking_code", "is", null)
      .or(`tracking_checked_at.is.null,tracking_checked_at.lt.${new Date(now - 3 * 3_600_000).toISOString()}`)
      .gte("created_at", new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString())
      .eq("stores.status", "active")
      .order("tracking_checked_at", { ascending: true, nullsFirst: true })
      .limit(MAX_ORDERS);
    if (error) return result; // sem o SQL
    const byStore = new Map<string, OrderRow[]>();
    for (const o of (data ?? []) as unknown as OrderRow[]) {
      if (!isCorreiosCode(o.tracking_code)) continue;
      byStore.set(o.store_id, [...(byStore.get(o.store_id) ?? []), o]);
    }
    for (const [storeId, orders] of byStore) {
      if (!(await correiosConfigured(db, storeId))) {
        // Sem contrato: marca como consultado para não ocupar a fila (volta em 3 h, caso o contrato seja ligado).
        await db.from("orders").update({ tracking_checked_at: new Date().toISOString() }).in("id", orders.map((o) => o.id));
        continue;
      }
      try {
        result.stores++;
        result.orders += orders.length;
        result.delivered += await syncStoreOrders(db, storeId, orders);
      } catch (err) {
        result.failed++;
        console.error("Rastreio dos Correios falhou para a loja", { storeId, err });
        // Credencial errada ou Correios fora do ar: tenta de novo em 3 h, sem prender a fila das outras lojas.
        await db.from("orders").update({ tracking_checked_at: new Date().toISOString() }).in("id", orders.map((o) => o.id)).is("tracking_events", null);
      }
    }
  } catch (err) {
    console.error("Falha na rotina de rastreio", err);
  }
  return result;
}

// Teste do contrato no /admin: autentica de novo e consulta um código qualquer (conta sem contrato autentica, mas
// recebe "API restrita" no rastreio).
export async function testCorreios(db: SupabaseClient, storeId: string) {
  try {
    await correiosToken(db, storeId, true);
    await fetchEvents(db, storeId, ["AA123456789BR"]);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof CorreiosError ? err.message : "Os Correios não responderam." };
  }
}
