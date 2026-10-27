import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { todayBR } from "@/lib/billing";
import { checkPhoneNumber, listTemplates, maskPhone, whatsappConnected, whatsappEnv } from "@/lib/whatsapp";
import { WA_EVENTS, WA_EVENT_KEYS, WA_FIELDS, WA_SUGGESTIONS, type WaEvent, isWaEvent, isWaField } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";
import { setWhatsappReminders } from "../actions";
import { removeEventTemplate } from "./actions";
import { ModelForm, type MetaTemplate } from "./model-form";
import { WhatsappTestForm } from "./test-form";

export const metadata = { title: "WhatsApp · Super-admin" };
export const dynamic = "force-dynamic";

const card = "space-y-3 rounded-xl border bg-white p-5 shadow-sm";
const ok = (v: boolean) => (v ? <span className="font-medium text-emerald-700">✓ configurado</span> : <span className="font-medium text-red-700">✗ faltando</span>);

type Msg = { id: string; created_at: string; to_phone: string; status: "sent" | "failed"; error: string | null; template: string; event?: string | null; stores: { name: string } | null };
type Cfg = { template: string; language: string; params: string[]; enabled: boolean };

// WhatsApp oficial da plataforma (Cloud API da Meta): conexão, modelos por evento, envio de teste, lojas e mensagens.
export default async function WhatsappAdminPage() {
  const { db } = await requireAdmin();
  const env = whatsappEnv();
  const monthStart = new Date(`${todayBR().slice(0, 7)}-01T00:00:00-03:00`).toISOString();
  const [phone, templates, { data: stores, error: storesError }, { data: monthRows }, recentFull, { data: cfgRows, error: cfgError }, legacyReminder] = await Promise.all([
    env.token && env.phoneNumberId ? checkPhoneNumber() : Promise.resolve(null),
    env.token && env.businessAccountId ? listTemplates() : Promise.resolve(null),
    db.from("stores").select("id, name, status, whatsapp_reminders").order("name"),
    db.from("whatsapp_messages").select("store_id, status").gte("created_at", monthStart).limit(20000),
    db.from("whatsapp_messages").select("id, created_at, to_phone, status, error, template, event, stores(name)").order("created_at", { ascending: false }).limit(50),
    db.from("whatsapp_event_templates").select("event, template, language, params, enabled"),
    eventTemplate(db, "booking_reminder"),
  ]);

  if (storesError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-neutral-600">Rode o SQL <code>20261118000000_lembrete_whatsapp.sql</code> para ativar este menu.</p>
      </div>
    );
  }
  // Sem o SQL dos eventos: últimas mensagens sem a coluna event, e o aviso na seção Modelos.
  const recent = recentFull.error
    ? (await db.from("whatsapp_messages").select("id, created_at, to_phone, status, error, template, stores(name)").order("created_at", { ascending: false }).limit(50)).data
    : recentFull.data;
  const { data: eventRows } = cfgError ? { data: null } : await db.from("whatsapp_messages").select("event, status").gte("created_at", monthStart).limit(20000);

  const counts = new Map<string, { sent: number; failed: number }>();
  for (const m of (monthRows ?? []) as { store_id: string; status: "sent" | "failed" }[]) {
    const c = counts.get(m.store_id) ?? { sent: 0, failed: 0 };
    c[m.status]++;
    counts.set(m.store_id, c);
  }
  const byEvent = new Map<string, { sent: number; failed: number }>();
  for (const m of (eventRows ?? []) as { event: string | null; status: "sent" | "failed" }[]) {
    const key = m.event ?? "booking_reminder"; // mensagens de antes do SQL eram todas lembrete
    const c = byEvent.get(key) ?? { sent: 0, failed: 0 };
    c[m.status]++;
    byEvent.set(key, c);
  }
  const totalSent = [...counts.values()].reduce((s, c) => s + c.sent, 0);
  const totalFailed = [...counts.values()].reduce((s, c) => s + c.failed, 0);

  const configs = new Map<WaEvent, Cfg>();
  for (const r of (cfgRows ?? []) as (Cfg & { event: string })[]) if (isWaEvent(r.event)) configs.set(r.event, r);
  const metaTemplates: MetaTemplate[] | null = templates?.ok
    ? [...templates.templates].sort((a, b) => Number(b.status === "APPROVED") - Number(a.status === "APPROVED") || a.name.localeCompare(b.name))
    : null;
  // Eventos que já enviam (com modelo; o lembrete pode estar só na variável antiga).
  const ready = WA_EVENT_KEYS.filter((e) => configs.has(e) || (e === "booking_reminder" && legacyReminder));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Número oficial da plataforma na API da Meta. Cada evento (lembrete, compra confirmada, pedido enviado...) usa um template aprovado na Meta, escolhido em
          Modelos, e só sai nas lojas ligadas aqui (o custo por mensagem é da plataforma). Este mês: <strong>{totalSent}</strong>{" "}
          {totalSent === 1 ? "mensagem enviada" : "mensagens enviadas"}
          {totalFailed > 0 && <span className="text-red-700"> · {totalFailed} com falha</span>}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Conexão</h2>
          <ul className="space-y-1 text-sm">
            <li><code>WHATSAPP_TOKEN</code>: {ok(env.token)}</li>
            <li><code>WHATSAPP_PHONE_NUMBER_ID</code>: {ok(env.phoneNumberId)}</li>
            <li><code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> (para listar os templates da conta): {ok(env.businessAccountId)}</li>
          </ul>
          {phone && (phone.ok ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Conectado: <strong>{phone.data.verified_name}</strong> · {phone.data.display_phone_number}
              {phone.data.quality_rating && <> · qualidade {phone.data.quality_rating}</>}
              {phone.data.messaging_limit_tier && <> · limite {phone.data.messaging_limit_tier}</>}
            </p>
          ) : (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">A Meta recusou a conexão: {phone.error}</p>
          ))}
          {!whatsappConnected() && <p className="text-sm text-amber-700">Enquanto faltar o token ou o número, nenhuma mensagem é enviada.</p>}
          {templates && !templates.ok && <p className="text-sm text-red-700">Não foi possível ler os templates: {templates.error}</p>}
        </section>

        <section className={card}>
          <h2 className="font-semibold">Enviar teste</h2>
          <p className="text-sm text-neutral-600">Manda o modelo do evento, com dados de exemplo, para o celular informado. Use para validar o template e a ordem das variáveis antes de ligar para as lojas.</p>
          <WhatsappTestForm disabled={!whatsappConnected()} events={ready} />
        </section>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Modelos</h2>
          <p className="text-sm text-neutral-600">
            Para cada evento: cadastre o template no WhatsApp Manager → Modelos de mensagem (categoria <strong>Utilidade</strong>; a campanha, <strong>Marketing</strong>;
            Português (BR); há um texto sugerido em cada um), espere a aprovação e escolha aqui, ligando cada variável a um dado. Evento sem modelo não envia nada.
          </p>
          {cfgError && <p className="mt-2 text-sm text-amber-700">Rode o SQL <code>20261119000000_whatsapp_eventos.sql</code> para salvar modelos.</p>}
        </div>
        {(["customer", "store", "optin"] as const).map((audience) => (
          <div key={audience} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {{ customer: "Para o cliente", store: "Para o lojista (WhatsApp da loja)", optin: "Campanhas (marketing, só para quem aceitou receber)" }[audience]}
            </h3>
            {WA_EVENT_KEYS.filter((e) => WA_EVENTS[e].audience === audience).map((e) => {
              const cfg = configs.get(e) ?? null;
              const legacy = !cfg && e === "booking_reminder" && legacyReminder ? legacyReminder : null;
              const c = byEvent.get(e);
              const s = WA_SUGGESTIONS[e];
              return (
                <details key={e} className="rounded-xl border bg-white shadow-sm">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      <span className="font-medium">{WA_EVENTS[e].label}</span>
                      <span className="block text-xs text-neutral-500">{WA_EVENTS[e].description}</span>
                    </span>
                    <span className="text-sm">
                      {cfg ? (
                        <span className={cfg.enabled ? "font-medium text-emerald-700" : "text-neutral-500"}>{cfg.enabled ? "Ligado" : "Desligado"} · {cfg.template}</span>
                      ) : legacy ? (
                        <span className="font-medium text-emerald-700">Ligado · {legacy.template} (variável antiga)</span>
                      ) : (
                        <span className="text-neutral-400">Sem modelo</span>
                      )}
                      {c && <span className="text-neutral-500"> · este mês: {c.sent}{c.failed ? <span className="text-red-700">, {c.failed} com falha</span> : ""}</span>}
                    </span>
                  </summary>
                  <div className="space-y-4 border-t px-4 py-4">
                    <div className="space-y-1 text-sm">
                      <p className="text-neutral-600">
                        Sugestão para cadastrar na Meta: nome <code>{s.name}</code>, corpo:
                      </p>
                      <code className="block whitespace-pre-wrap rounded bg-neutral-50 px-3 py-2 text-xs">{s.body}</code>
                      <p className="text-xs text-neutral-500">Exemplos das variáveis (a Meta pede): {s.params.map((f, i) => `{{${i + 1}}} ${WA_FIELDS[f].sample}`).join(" · ")}</p>
                    </div>
                    <ModelForm
                      event={e}
                      templates={metaTemplates}
                      current={cfg ? { ...cfg, params: cfg.params.filter(isWaField) } : legacy}
                    />
                    {cfg && (
                      <form action={removeEventTemplate}>
                        <input type="hidden" name="event" value={e} />
                        <button type="submit" className="text-xs text-red-700 hover:underline">Remover modelo</button>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        ))}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-semibold">Lojas</h2>
        <p className="border-b px-4 py-2 text-xs text-neutral-500">Ligada, a loja envia todos os eventos com modelo. Para escolher só alguns, abra a loja.</p>
        <ul className="divide-y text-sm">
          {((stores ?? []) as { id: string; name: string; status: string; whatsapp_reminders: boolean }[]).map((s) => {
            const c = counts.get(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <Link href={`/admin/lojas/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  {s.status !== "active" && <span className="text-neutral-400"> (suspensa)</span>}
                  <span className="text-neutral-500"> · este mês: {c?.sent ?? 0} {(c?.sent ?? 0) === 1 ? "enviada" : "enviadas"}{c?.failed ? <span className="text-red-700">, {c.failed} com falha</span> : ""}</span>
                </span>
                <form action={setWhatsappReminders}>
                  <input type="hidden" name="storeId" value={s.id} />
                  <input type="hidden" name="enabled" value={s.whatsapp_reminders ? "0" : "1"} />
                  <button type="submit" className={`rounded-md px-3 py-1 text-xs font-semibold ${s.whatsapp_reminders ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "border bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                    {s.whatsapp_reminders ? "Ligado · desligar" : "Desligado · ligar"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-semibold">Últimas mensagens</h2>
        {(recent ?? []).length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {((recent ?? []) as unknown as Msg[]).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {formatDateTime(m.created_at)} · {m.stores?.name ?? "—"} · {isWaEvent(m.event) ? WA_EVENTS[m.event].label : m.template} · {maskPhone(m.to_phone)}
                  {m.error && <span className="block text-xs text-red-700">{m.error}</span>}
                </span>
                <span className={m.status === "sent" ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{m.status === "sent" ? "Enviada" : "Falhou"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
