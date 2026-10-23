import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPlatformError } from "@/lib/email";
import { type EmailStatus, STATUS_BY_EVENT, bounceReason, emailStatusLabel, isProblem, nextStatus, verifyResendSignature } from "@/lib/resend-webhook";

// Avisos do Resend sobre os e-mails enviados (cadastrado no painel do Resend → Webhooks):
//   https://www.pmsapp.dev/api/webhooks/resend  — eventos delivered, delivery_delayed, bounced e complained.
// Atualiza sent_emails; e-mail de fatura, de venda para o lojista ou de proposta que volta gera alerta para a plataforma.
// E-mail de pedido que volta aparece no pedido e no Resumo do painel do lojista.

const PROVIDER = "resend";

const ALERT_TITLE: Record<string, string> = {
  invoice: "E-mail de cobrança não chegou ao lojista",
  store: "E-mail de venda não chegou ao lojista",
  proposal: "Proposta comercial não chegou ao cliente",
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();
  if (!secret) {
    after(() => notifyPlatformError("webhook-resend:sem-segredo", "Webhook do Resend sem RESEND_WEBHOOK_SECRET", { acao: "Cadastre o Signing Secret do webhook na Vercel" }));
    return NextResponse.json({ error: "não configurado" }, { status: 503 });
  }
  const id = req.headers.get("svix-id");
  const valid = verifyResendSignature({ id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"), body, secret });
  if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string; bounce?: { type?: string; subType?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const incoming = STATUS_BY_EVENT[event.type ?? ""];
  const emailId = event.data?.email_id;
  if (!incoming || !emailId) return NextResponse.json({ ok: true, ignored: true });

  // Idempotência: o mesmo aviso (svix-id) só é processado uma vez.
  const db = createAdminClient();
  const { error: dupErr } = await db.from("webhook_events").insert({ provider: PROVIDER, event_id: id!, processed_at: new Date().toISOString() });
  if (dupErr?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });

  const { data: row } = await db.from("sent_emails").select("resend_id, kind, ref_id, store_id, to_email, subject, status, stores(name)").eq("resend_id", emailId).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, untracked: true }); // e-mail que não rastreamos (ex.: alertas)

  const status = nextStatus(row.status as EmailStatus, incoming);
  if (status === row.status) return NextResponse.json({ ok: true, unchanged: true });
  const detail = incoming === "bounced" ? bounceReason(event.data?.bounce) : null;
  await db.from("sent_emails").update({ status, detail, updated_at: new Date().toISOString() }).eq("resend_id", emailId);

  const title = ALERT_TITLE[row.kind];
  if (isProblem(status) && title) {
    const store = (row.stores as unknown as { name: string } | null)?.name;
    after(() =>
      notifyPlatformError(`email:${row.kind}:${emailId}`, title, {
        ...(store ? { loja: store } : {}),
        para: row.to_email,
        assunto: row.subject,
        situacao: emailStatusLabel(status, detail),
        acao: row.kind === "proposal" ? "Confira o e-mail na proposta ou envie pelo WhatsApp" : "Confira o e-mail da loja (admin ou Configurações do painel)",
      }),
    );
  }
  return NextResponse.json({ ok: true, status });
}
