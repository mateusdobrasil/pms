import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { todayBR } from "@/lib/billing";
import { REMINDER_SAMPLE, REMINDER_TEMPLATE_TEXT, checkPhoneNumber, listTemplates, maskPhone, whatsappConfigured, whatsappEnv } from "@/lib/whatsapp";
import { setWhatsappReminders } from "../actions";
import { WhatsappTestForm } from "./test-form";

export const metadata = { title: "WhatsApp · Super-admin" };
export const dynamic = "force-dynamic";

const card = "space-y-3 rounded-xl border bg-white p-5 shadow-sm";
const ok = (v: boolean) => (v ? <span className="font-medium text-emerald-700">✓ configurado</span> : <span className="font-medium text-red-700">✗ faltando</span>);

type Msg = { id: string; created_at: string; to_phone: string; status: "sent" | "failed"; error: string | null; template: string; stores: { name: string } | null };

// WhatsApp oficial da plataforma (Cloud API da Meta): conexão, template, envio de teste, lojas e mensagens.
export default async function WhatsappAdminPage() {
  const { db } = await requireAdmin();
  const env = whatsappEnv();
  const monthStart = new Date(`${todayBR().slice(0, 7)}-01T00:00:00-03:00`).toISOString();
  const [phone, templates, { data: stores, error: storesError }, { data: monthRows }, { data: recent }] = await Promise.all([
    env.token && env.phoneNumberId ? checkPhoneNumber() : Promise.resolve(null),
    env.token && env.businessAccountId ? listTemplates() : Promise.resolve(null),
    db.from("stores").select("id, name, status, whatsapp_reminders").order("name"),
    db.from("whatsapp_messages").select("store_id, status").gte("created_at", monthStart).limit(20000),
    db.from("whatsapp_messages").select("id, created_at, to_phone, status, error, template, stores(name)").order("created_at", { ascending: false }).limit(50),
  ]);

  if (storesError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-neutral-600">Rode o SQL <code>20261118000000_lembrete_whatsapp.sql</code> para ativar este menu.</p>
      </div>
    );
  }
  const counts = new Map<string, { sent: number; failed: number }>();
  for (const m of (monthRows ?? []) as { store_id: string; status: "sent" | "failed" }[]) {
    const c = counts.get(m.store_id) ?? { sent: 0, failed: 0 };
    c[m.status]++;
    counts.set(m.store_id, c);
  }
  const totalSent = [...counts.values()].reduce((s, c) => s + c.sent, 0);
  const totalFailed = [...counts.values()].reduce((s, c) => s + c.failed, 0);
  const reminder = templates?.ok ? templates.templates.filter((t) => t.name === env.template) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Número oficial da plataforma na API da Meta. Hoje envia o lembrete da véspera dos agendamentos, só nas lojas ligadas aqui (o custo por mensagem é da
          plataforma). Este mês: <strong>{totalSent}</strong> {totalSent === 1 ? "mensagem enviada" : "mensagens enviadas"}
          {totalFailed > 0 && <span className="text-red-700"> · {totalFailed} com falha</span>}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Conexão</h2>
          <ul className="space-y-1 text-sm">
            <li><code>WHATSAPP_TOKEN</code>: {ok(env.token)}</li>
            <li><code>WHATSAPP_PHONE_NUMBER_ID</code>: {ok(env.phoneNumberId)}</li>
            <li><code>WHATSAPP_REMINDER_TEMPLATE</code>: {env.template ? <span className="font-medium text-emerald-700">{env.template}</span> : ok(false)}</li>
            <li><code>WHATSAPP_TEMPLATE_LANG</code>: {env.lang}</li>
            <li><code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> (opcional, para ver a aprovação do template): {ok(env.businessAccountId)}</li>
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
          {!whatsappConfigured() && <p className="text-sm text-amber-700">Enquanto faltar alguma variável obrigatória, nenhum lembrete é enviado.</p>}
        </section>

        <section className={card}>
          <h2 className="font-semibold">Template do lembrete</h2>
          <p className="text-sm text-neutral-600">
            Cadastre no WhatsApp Manager → Modelos de mensagem: categoria <strong>Utilidade</strong>, idioma <strong>Português (BR)</strong>, e o corpo abaixo. Use
            como exemplos: {REMINDER_SAMPLE.map((s, i) => `{{${i + 1}}} ${s}`).join(" · ")}. Depois de aprovado, coloque o nome em <code>WHATSAPP_REMINDER_TEMPLATE</code>.
          </p>
          <code className="block whitespace-pre-wrap rounded bg-neutral-50 px-3 py-2 text-xs">{REMINDER_TEMPLATE_TEXT}</code>
          {templates && (templates.ok ? (
            reminder.length ? (
              <p className="text-sm">
                Situação na Meta: {reminder.map((t) => <span key={t.language} className={t.status === "APPROVED" ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{t.status} ({t.language}) </span>)}
              </p>
            ) : (
              <p className="text-sm text-amber-700">Nenhum template com o nome &quot;{env.template ?? "—"}&quot; na conta.</p>
            )
          ) : (
            <p className="text-sm text-red-700">Não foi possível ler os templates: {templates.error}</p>
          ))}
        </section>
      </div>

      <section className={card}>
        <h2 className="font-semibold">Enviar teste</h2>
        <p className="text-sm text-neutral-600">Manda o template do lembrete, com os dados de exemplo, para o celular informado. Use para validar antes de ligar para as lojas.</p>
        <WhatsappTestForm disabled={!whatsappConfigured()} />
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-semibold">Lojas</h2>
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
                  {formatDateTime(m.created_at)} · {m.stores?.name ?? "—"} · {maskPhone(m.to_phone)}
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
