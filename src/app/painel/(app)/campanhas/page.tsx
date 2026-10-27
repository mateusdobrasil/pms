import { requireStore } from "@/lib/panel";
import { storeBaseUrl } from "@/lib/urls";
import { formatDateTime, formatPhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings } from "@/lib/booking-server";
import { packagesForSale } from "@/lib/packages-server";
import { listTemplates } from "@/lib/whatsapp";
import { WA_SUGGESTIONS, type WaField } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";
import { campaignState } from "@/lib/whatsapp-campaigns-server";
import { CampaignForm } from "./campaign-form";
import { stopCampaign } from "./actions";

export const metadata = { title: "Campanhas · PMS app" };
export const dynamic = "force-dynamic";

type Campaign = { id: string; text: string; link: string; coupon_code: string | null; status: "sending" | "done" | "canceled"; total: number; created_at: string };
type Optin = { id: string; name: string; phone: string; source: "checkout" | "agenda"; opted_in_at: string; opted_out_at: string | null };

const STATUS = { sending: "Enviando", done: "Concluída", canceled: "Cancelada" };

// Campanhas no WhatsApp: novidades e promoções para quem aceitou receber, dentro da cota do mês.
export default async function CampaignsPage() {
  const { supabase, store } = await requireStore();
  const db = createAdminClient();
  const state = await campaignState(db, store.id);
  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Campanhas no WhatsApp</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Mande novidades e promoções pelo WhatsApp oficial da PMS app para os clientes que <strong>aceitaram receber</strong> (a caixa aparece no checkout e no
        agendamento, sempre desmarcada). Cada mensagem tem um link para a pessoa sair da lista quando quiser.
      </p>
    </div>
  );
  if (!state) return <div className="space-y-4">{header}<p className="text-sm text-neutral-600">Este recurso está sendo instalado. Volte em alguns minutos.</p></div>;
  if (!state.offered) {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">As campanhas no WhatsApp não estão no seu plano. Fale com a PMS app para incluir.</p>
      </div>
    );
  }

  const [{ data: domains }, { data: campaignRows }, { data: optinRows }, { data: couponRows }, booking, packages, cfg] = await Promise.all([
    supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id),
    supabase.from("whatsapp_campaigns").select("id, text, link, coupon_code, status, total, created_at").eq("store_id", store.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("whatsapp_optins").select("id, name, phone, source, opted_in_at, opted_out_at").eq("store_id", store.id).order("opted_in_at", { ascending: false }).limit(100),
    // Cupons que ainda valem (os pessoais de aniversário ficam de fora).
    supabase.from("coupons").select("code").eq("store_id", store.id).eq("active", true).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).neq("origin", "birthday").order("code"),
    getBookingSettings(db, store.id),
    packagesForSale(db, store.id),
    eventTemplate(db, "campaign"),
  ]);
  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
  const baseUrl = domain ? storeBaseUrl(domain) : "";
  const campaigns = (campaignRows ?? []) as Campaign[];
  const optins = (optinRows ?? []) as Optin[];

  // Andamento de cada campanha (enviadas, falhas, na fila).
  const { data: recRows } = campaigns.length
    ? await supabase.from("whatsapp_campaign_recipients").select("campaign_id, status").in("campaign_id", campaigns.map((c) => c.id)).limit(20000)
    : { data: [] };
  const progress = new Map<string, Record<string, number>>();
  for (const r of (recRows ?? []) as { campaign_id: string; status: string }[]) {
    const p = progress.get(r.campaign_id) ?? {};
    p[r.status] = (p[r.status] ?? 0) + 1;
    progress.set(r.campaign_id, p);
  }

  // Texto do template (da Meta; ou a sugestão, se for o mesmo nome) para a prévia.
  let template: { body: string; params: WaField[] } | null = null;
  if (cfg) {
    const meta = await listTemplates();
    const body = meta.ok ? meta.templates.find((t) => t.name === cfg.template && t.language === cfg.language)?.body : undefined;
    const fallback = cfg.template === WA_SUGGESTIONS.campaign.name ? WA_SUGGESTIONS.campaign.body : undefined;
    if (body ?? fallback) template = { body: (body ?? fallback)!, params: cfg.params };
  }
  const paths = [
    { path: "/", label: "Página inicial da loja" },
    ...(booking?.enabled ? [{ path: "/agendar", label: "Agendar horário" }] : []),
    ...(packages.length ? [{ path: "/pacotes", label: "Pacotes" }] : []),
    { path: "/links", label: "Página de links" },
  ];
  const recipients = Math.min(state.audience, state.remaining);
  const sending = campaigns.some((c) => c.status === "sending");

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">Aceitaram receber</p>
          <p className="text-2xl font-semibold">{state.audience}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">Mensagens do mês</p>
          <p className="text-2xl font-semibold">
            {state.sentThisMonth + state.queued} <span className="text-base font-normal text-neutral-500">de {state.quota}</span>
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">Ainda dá para enviar</p>
          <p className="text-2xl font-semibold">{state.remaining}</p>
        </div>
      </div>

      {!state.ready ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">As campanhas estão sendo configuradas pela PMS app. Logo você poderá enviar.</p>
      ) : state.nextAt ? (
        <p className={`rounded-md px-4 py-3 text-sm ${sending ? "bg-emerald-50 text-emerald-900" : "bg-neutral-100 text-neutral-700"}`}>
          {sending && <strong>Campanha em envio: as mensagens saem aos poucos, das 9h às 21h (acompanhe abaixo). </strong>}
          Uma campanha por dia (para o WhatsApp não marcar a loja como spam). A próxima pode sair a partir de{" "}
          {formatDateTime(state.nextAt.toISOString())}.
        </p>
      ) : state.audience === 0 ? (
        <p className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          Ainda ninguém aceitou receber. A caixa &quot;Quero receber novidades pelo WhatsApp&quot; já aparece no checkout e no agendamento: conforme os clientes
          marcarem, eles entram aqui.
        </p>
      ) : state.remaining === 0 ? (
        <p className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700">A cota de mensagens deste mês acabou. Ela renova no dia 1º.</p>
      ) : (
        <CampaignForm
          storeName={store.name}
          baseUrl={baseUrl}
          paths={paths}
          coupons={(couponRows ?? []).map((c) => c.code as string)}
          recipients={recipients}
          template={template}
        />
      )}

      {campaigns.length > 0 && (
        <section className="rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-4 py-3 font-medium">Campanhas enviadas{sending && <span className="text-sm font-normal text-neutral-500"> · atualize a página para ver o andamento</span>}</h2>
          <ul className="divide-y text-sm">
            {campaigns.map((c) => {
              const p = progress.get(c.id) ?? {};
              const queued = (p.pending ?? 0) + (p.sending ?? 0);
              return (
                <li key={c.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-neutral-500">
                      {formatDateTime(c.created_at)} · {STATUS[c.status]}
                      {c.coupon_code && <> · cupom <span className="font-mono">{c.coupon_code}</span></>}
                    </span>
                    {c.status === "sending" && (
                      <form action={stopCampaign}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="rounded-md border px-2.5 py-1 text-xs font-medium text-red-700 hover:border-red-300">Cancelar o que falta</button>
                      </form>
                    )}
                  </div>
                  <p>{c.text}</p>
                  <p className="text-xs text-neutral-500">
                    {p.sent ?? 0} de {c.total} enviadas
                    {queued > 0 && ` · ${queued} na fila`}
                    {p.failed ? <span className="text-red-700"> · {p.failed} com falha</span> : ""}
                    {p.skipped ? ` · ${p.skipped} não enviadas (saíram da lista ou cancelada)` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-medium">Quem aceitou receber</h2>
        {optins.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Ninguém ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {optins.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {o.name} · {formatPhone(o.phone)}
                  <span className="text-neutral-500"> · {o.source === "checkout" ? "na compra" : "no agendamento"} em {formatDateTime(o.opted_in_at)}</span>
                </span>
                {o.opted_out_at && <span className="text-xs text-neutral-500">saiu da lista</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
