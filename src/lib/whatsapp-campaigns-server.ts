import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeBaseUrl } from "@/lib/urls";
import { sendTemplate, toWhatsappNumber, whatsappConnected } from "@/lib/whatsapp";
import { buildParams } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";
import { chunks } from "@/lib/supabase/fetch-all";
import { campaignHoursOpen, campaignLink, campaignRemaining, cleanCampaignText, nextCampaignAt } from "@/lib/whatsapp-campaigns";

const monthStart = () => {
  const ym = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  return new Date(`${ym}-01T00:00:00-03:00`).toISOString();
};

async function storeBase(db: SupabaseClient, storeId: string) {
  const { data } = await db.from("store_domains").select("domain, is_primary").eq("store_id", storeId);
  const domain = (data ?? []).find((d) => d.is_primary)?.domain ?? data?.[0]?.domain;
  return domain ? storeBaseUrl(domain) : null;
}

// A loja oferece a caixa "quero receber novidades"? (WhatsApp ligado e cota de campanhas > 0; sem o SQL, não.)
export async function campaignsOffered(db: SupabaseClient, storeId: string) {
  const { data, error } = await db.from("stores").select("whatsapp_reminders, whatsapp_campaign_quota").eq("id", storeId).maybeSingle();
  const r = data as { whatsapp_reminders: boolean; whatsapp_campaign_quota: number } | null;
  return !error && !!r?.whatsapp_reminders && r.whatsapp_campaign_quota > 0;
}

// Cliente marcou a caixa no checkout ou no agendamento: registra (ou renova) o aceite. Nunca lança erro.
export async function recordOptIn(db: SupabaseClient, storeId: string, who: { phone: string; name: string; source: "checkout" | "agenda" }) {
  try {
    const phone = who.phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (!/^\d{10,11}$/.test(phone) || !(await campaignsOffered(db, storeId))) return;
    await db
      .from("whatsapp_optins")
      .upsert({ store_id: storeId, phone, name: who.name.trim().slice(0, 120), source: who.source, opted_in_at: new Date().toISOString(), opted_out_at: null }, { onConflict: "store_id,phone" });
  } catch (err) {
    console.error("Falha ao registrar aceite do WhatsApp", { storeId, err });
  }
}

export type CampaignState = {
  offered: boolean; // ligado pelo super-admin (WhatsApp + cota)
  ready: boolean; // conectado e com modelo de campanha
  quota: number;
  sentThisMonth: number;
  queued: number;
  remaining: number;
  audience: number;
  nextAt: Date | null;
};

export async function campaignState(db: SupabaseClient, storeId: string): Promise<CampaignState | null> {
  const { data: store, error } = await db.from("stores").select("whatsapp_reminders, whatsapp_campaign_quota").eq("id", storeId).maybeSingle();
  if (error || !store) return null; // sem o SQL das campanhas
  const s = store as { whatsapp_reminders: boolean; whatsapp_campaign_quota: number };
  const [cfg, { count: sent }, { count: queued }, { count: audience }, { data: last }] = await Promise.all([
    eventTemplate(db, "campaign"),
    // Enviadas no mês: campanhas e cupons de aniversário (os dois são marketing e usam a mesma cota).
    db.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("store_id", storeId).or("campaign_id.not.is.null,event.eq.birthday").eq("status", "sent").gte("created_at", monthStart()),
    db.from("whatsapp_campaign_recipients").select("id", { count: "exact", head: true }).eq("store_id", storeId).in("status", ["pending", "sending"]),
    db.from("whatsapp_optins").select("id", { count: "exact", head: true }).eq("store_id", storeId).is("opted_out_at", null),
    db.from("whatsapp_campaigns").select("created_at").eq("store_id", storeId).neq("status", "canceled").order("created_at", { ascending: false }).limit(1),
  ]);
  const quota = s.whatsapp_campaign_quota;
  return {
    offered: s.whatsapp_reminders && quota > 0,
    ready: whatsappConnected() && !!cfg?.enabled,
    quota,
    sentThisMonth: sent ?? 0,
    queued: queued ?? 0,
    remaining: campaignRemaining(quota, sent ?? 0, queued ?? 0),
    audience: audience ?? 0,
    nextAt: nextCampaignAt(last?.[0]?.created_at ?? null, new Date()),
  };
}

// Cria a campanha e a fila (os aceites mais recentes, até a cota do mês). O envio é feito por processCampaignQueue.
export async function startCampaign(
  db: SupabaseClient,
  storeId: string,
  input: { text: string; path: string; couponCode: string | null },
): Promise<{ ok: true; id: string; total: number; capped: boolean } | { ok: false; error: string }> {
  const state = await campaignState(db, storeId);
  if (!state?.offered) return { ok: false, error: "As campanhas no WhatsApp não estão liberadas para a sua loja. Fale com a PMS app." };
  if (!state.ready) return { ok: false, error: "As campanhas estão sendo configuradas pela PMS app. Tente mais tarde." };
  if (state.nextAt) return { ok: false, error: `Uma campanha por dia: a próxima pode sair a partir de ${state.nextAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.` };
  if (state.remaining <= 0) return { ok: false, error: "A cota de mensagens deste mês acabou. Ela renova no dia 1º." };
  const text = cleanCampaignText(input.text);
  if (!text) return { ok: false, error: "Escreva a mensagem (de 5 a 300 caracteres)." };
  const base = await storeBase(db, storeId);
  if (!base) return { ok: false, error: "A loja ainda não tem endereço." };
  let coupon: string | null = null;
  if (input.couponCode) {
    const { data } = await db.from("coupons").select("code, active, ends_at").eq("store_id", storeId).eq("code", input.couponCode).maybeSingle();
    if (!data?.active) return { ok: false, error: "Cupom não encontrado ou desativado." };
    if (data.ends_at && new Date(data.ends_at) < new Date()) return { ok: false, error: "Esse cupom já venceu: escolha outro ou mande sem cupom." };
    coupon = data.code;
  }
  const { data: optins } = await db.from("whatsapp_optins").select("id").eq("store_id", storeId).is("opted_out_at", null).order("opted_in_at", { ascending: false }).limit(state.remaining);
  const ids = (optins ?? []).map((o) => o.id as string);
  if (!ids.length) return { ok: false, error: "Ainda ninguém aceitou receber novidades da loja pelo WhatsApp." };

  const { data: campaign, error } = await db
    .from("whatsapp_campaigns")
    .insert({ store_id: storeId, text, link: campaignLink(base, input.path, coupon), coupon_code: coupon, total: ids.length })
    .select("id")
    .single();
  if (error || !campaign) return { ok: false, error: "Não foi possível criar a campanha agora." };
  for (const part of chunks(ids, 500)) {
    await db.from("whatsapp_campaign_recipients").insert(part.map((optin_id) => ({ campaign_id: campaign.id, store_id: storeId, optin_id })));
  }
  return { ok: true, id: campaign.id, total: ids.length, capped: state.audience > ids.length };
}

type QueueRow = {
  id: string;
  campaign_id: string;
  store_id: string;
  whatsapp_campaigns: { text: string; link: string; coupon_code: string | null; status: string };
  whatsapp_optins: { phone: string; name: string; opted_out_at: string | null; token: string };
  stores: { name: string; whatsapp_reminders: boolean; store_domains: { domain: string; is_primary: boolean }[] };
};

// Envia a fila aos poucos (rotina a cada 5 min e logo depois de criar a campanha). Cada destinatário é travado
// antes do envio (pending → sending), então duas execuções juntas não mandam duas vezes. Nunca lança erro.
export async function processCampaignQueue(db: SupabaseClient, max = 150, budgetMs = 45_000) {
  const result = { sent: 0, failed: 0, skipped: 0 };
  try {
    const started = Date.now();
    // Travados há mais de 10 min (execução interrompida): não se sabe se saiu; marca como falha, sem reenviar.
    await db
      .from("whatsapp_campaign_recipients")
      .update({ status: "failed", error: "envio interrompido" })
      .eq("status", "sending")
      .lt("sent_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if (!campaignHoursOpen(new Date())) return result; // de madrugada a fila espera
    const cfg = await eventTemplate(db, "campaign");
    if (!whatsappConnected() || !cfg?.enabled) return result; // a fila espera a configuração
    const { data } = await db
      .from("whatsapp_campaign_recipients")
      .select(
        "id, campaign_id, store_id, whatsapp_campaigns!inner(text, link, coupon_code, status), whatsapp_optins!inner(phone, name, opted_out_at, token), stores!inner(name, whatsapp_reminders, store_domains(domain, is_primary))",
      )
      .eq("status", "pending")
      .eq("whatsapp_campaigns.status", "sending")
      .limit(max);
    for (const r of (data ?? []) as unknown as QueueRow[]) {
      if (Date.now() - started > budgetMs) break;
      const { data: claimed } = await db
        .from("whatsapp_campaign_recipients")
        .update({ status: "sending", sent_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;
      const to = toWhatsappNumber(r.whatsapp_optins.phone);
      const domain = (r.stores.store_domains.find((d) => d.is_primary) ?? r.stores.store_domains[0])?.domain;
      // Saiu da lista, loja desligada ou sem endereço: não envia.
      if (!to || !domain || r.whatsapp_optins.opted_out_at || !r.stores.whatsapp_reminders) {
        await db.from("whatsapp_campaign_recipients").update({ status: "skipped" }).eq("id", r.id);
        result.skipped++;
        continue;
      }
      const name = r.whatsapp_optins.name;
      const params = buildParams(cfg.params, {
        first_name: name.trim().split(/\s+/)[0] || name,
        customer_name: name,
        store_name: r.stores.name,
        campaign_text: r.whatsapp_campaigns.text,
        link: r.whatsapp_campaigns.link,
        coupon_code: r.whatsapp_campaigns.coupon_code ?? "",
        optout_link: `${storeBaseUrl(domain)}/whatsapp/sair/${r.whatsapp_optins.token}`,
      });
      const sent = await sendTemplate(to, cfg.template, params, cfg.language);
      await db.from("whatsapp_messages").insert({
        store_id: r.store_id,
        to_phone: to,
        template: cfg.template,
        wa_message_id: sent.ok ? sent.id : null,
        status: sent.ok ? "sent" : "failed",
        error: sent.ok ? null : sent.error,
        event: "campaign",
        campaign_id: r.campaign_id,
      });
      await db
        .from("whatsapp_campaign_recipients")
        .update({ status: sent.ok ? "sent" : "failed", error: sent.ok ? null : sent.error, sent_at: new Date().toISOString() })
        .eq("id", r.id);
      if (sent.ok) result.sent++;
      else result.failed++;
    }
    // Campanhas sem ninguém na fila: concluídas.
    const { data: open } = await db.from("whatsapp_campaigns").select("id").eq("status", "sending");
    for (const c of open ?? []) {
      const { count } = await db.from("whatsapp_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["pending", "sending"]);
      if (!count) await db.from("whatsapp_campaigns").update({ status: "done" }).eq("id", c.id).eq("status", "sending");
    }
  } catch (err) {
    console.error("Falha na fila de campanhas", err);
  }
  return result;
}

// Cancela o que ainda não saiu (o que já foi enviado fica).
export async function cancelCampaign(db: SupabaseClient, storeId: string, id: string) {
  await db.from("whatsapp_campaign_recipients").update({ status: "skipped", error: "campanha cancelada" }).eq("campaign_id", id).eq("store_id", storeId).eq("status", "pending");
  await db.from("whatsapp_campaigns").update({ status: "canceled" }).eq("id", id).eq("store_id", storeId).eq("status", "sending");
}

// "Não quero mais receber": pelo link da mensagem (token só daquela pessoa naquela loja).
export async function optOut(db: SupabaseClient, storeId: string, token: string) {
  const { data } = await db
    .from("whatsapp_optins")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("token", token)
    .is("opted_out_at", null)
    .select("id");
  return !!data?.length;
}
