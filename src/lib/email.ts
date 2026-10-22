import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/format";
import { storeBaseUrl } from "@/lib/urls";

// E-mails transacionais via API do Resend. Sem RESEND_API_KEY, só registra no log (dev).
// EMAIL_FROM: endereço de um domínio verificado no Resend, ex.: pedidos@pmsapp.dev
// (para testes, "onboarding@resend.dev" envia só para o e-mail da sua conta Resend).

type Email = { to: string; subject: string; html: string; replyTo?: string | null; fromName: string; idempotencyKey: string };

async function sendEmail(email: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  if (!apiKey) {
    console.log(`[e-mail não enviado: RESEND_API_KEY ausente] para ${email.to}: ${email.subject}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: `${email.fromName.replace(/[<>"]/g, "")} <${fromAddress}>`,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      reply_to: email.replyTo ?? undefined,
    }),
  });
  if (!res.ok) {
    console.error("Resend recusou o e-mail", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- dados do pedido

type OrderForEmail = {
  id: string;
  code: string;
  public_token: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_method: string;
  shipping_address: Record<string, string> | null;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  tracking_code: string | null;
  stock_issue: boolean;
  stores: { name: string; email: string | null; whatsapp: string | null; primary_color: string; store_domains: { domain: string; is_primary: boolean }[] };
  order_items: { product_name: string; variant_name: string; unit_price_cents: number; quantity: number }[];
};

async function loadOrder(orderId: string) {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      "id, code, public_token, status, customer_name, customer_email, customer_phone, shipping_method, shipping_address, subtotal_cents, shipping_cents, discount_cents, total_cents, tracking_code, stock_issue, stores(name, email, whatsapp, primary_color, store_domains(domain, is_primary)), order_items(product_name, variant_name, unit_price_cents, quantity)",
    )
    .eq("id", orderId)
    .single();
  return data as unknown as OrderForEmail | null;
}

function orderUrl(o: OrderForEmail) {
  const domains = o.stores.store_domains;
  const domain = (domains.find((d) => d.is_primary) ?? domains[0])?.domain;
  return domain ? `${storeBaseUrl(domain)}/pedido/${o.public_token}` : null;
}

// Trava: só quem preencher a coluna envia. Se o envio falhar, libera para tentar de novo.
async function claim(orderId: string, column: "notified_paid_at" | "notified_shipped_at", statuses: string[]) {
  const { data } = await createAdminClient()
    .from("orders")
    .update({ [column]: new Date().toISOString() })
    .eq("id", orderId)
    .is(column, null)
    .in("status", statuses)
    .select("id");
  return !!data?.length;
}

async function release(orderId: string, column: "notified_paid_at" | "notified_shipped_at") {
  await createAdminClient().from("orders").update({ [column]: null }).eq("id", orderId);
}

// ---------------------------------------------------------------- notificações

export async function notifyOrderPaid(orderId: string) {
  try {
    if (!(await claim(orderId, "notified_paid_at", ["paid", "preparing", "shipped", "delivered"]))) return;
    const o = await loadOrder(orderId);
    if (!o) return;
    const url = orderUrl(o);

    const customerOk = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `paid-${o.id}`,
      subject: `Pedido ${o.code} confirmado`,
      html: layout(o, `
        <h1 style="margin:0 0 8px;font-size:22px">Pagamento confirmado!</h1>
        <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. Recebemos o pagamento do pedido <strong>${o.code}</strong>.
        ${o.shipping_method === "pickup" ? "Avisaremos quando estiver pronto para retirada." : "Avisaremos quando for enviado, com o código de rastreio."}</p>
        ${itemsTable(o)}
        ${o.shipping_address ? addressBlock(o.shipping_address) : ""}
        ${url ? button(url, "Acompanhar pedido", o.stores.primary_color) : ""}`),
    });

    if (o.stores.email) {
      await sendEmail({
        to: o.stores.email,
        fromName: "PMS app",
        idempotencyKey: `paid-store-${o.id}`,
        subject: `Nova venda: pedido ${o.code} (${formatBRL(o.total_cents)})`,
        html: layout(o, `
          <h1 style="margin:0 0 8px;font-size:22px">Nova venda 🎉</h1>
          <p style="margin:0 0 20px;color:#525252">Pedido <strong>${o.code}</strong> pago por ${esc(o.customer_name)}
          (${esc(o.customer_email)}${o.customer_phone ? `, ${esc(formatPhone(o.customer_phone))}` : ""}).</p>
          ${o.stock_issue ? `<p style="margin:0 0 20px;padding:12px;border-radius:8px;background:#fef2f2;color:#991b1b">Atenção: faltou estoque de algum item na confirmação. Confira antes de enviar.</p>` : ""}
          ${itemsTable(o)}
          ${o.shipping_address ? addressBlock(o.shipping_address) : ""}
          <p style="margin:20px 0 0;color:#525252">Veja os detalhes no painel da loja.</p>`),
      });
    }

    if (!customerOk) await release(orderId, "notified_paid_at");
  } catch (err) {
    console.error("Falha ao notificar pagamento", { orderId, err });
  }
}

export async function notifyOrderShipped(orderId: string) {
  try {
    if (!(await claim(orderId, "notified_shipped_at", ["shipped", "delivered"]))) return;
    const o = await loadOrder(orderId);
    if (!o) return;
    const url = orderUrl(o);
    const pickup = o.shipping_method === "pickup";

    const ok = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `shipped-${o.id}`,
      subject: pickup ? `Pedido ${o.code} pronto para retirada` : `Pedido ${o.code} enviado`,
      html: layout(o, (pickup
        ? `<h1 style="margin:0 0 8px;font-size:22px">Pronto para retirada!</h1>
           <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. Seu pedido <strong>${o.code}</strong> já pode ser retirado na loja.
           ${o.stores.whatsapp ? `Dúvidas? Fale com a gente pelo <a href="https://wa.me/${o.stores.whatsapp}">WhatsApp</a>.` : ""}</p>`
        : `<h1 style="margin:0 0 8px;font-size:22px">Seu pedido foi enviado!</h1>
           <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. O pedido <strong>${o.code}</strong> saiu para entrega por ${esc(o.shipping_method)}.</p>
           ${o.tracking_code ? `<p style="margin:0 0 20px;padding:14px;border-radius:8px;background:#f5f5f5;font-size:15px">Código de rastreio:<br><strong style="font-size:18px;letter-spacing:1px">${esc(o.tracking_code)}</strong></p>` : ""}`)
        + (url ? button(url, "Acompanhar pedido", o.stores.primary_color) : "")),
    });
    if (!ok) await release(orderId, "notified_shipped_at");
  } catch (err) {
    console.error("Falha ao notificar envio", { orderId, err });
  }
}

// ---------------------------------------------------------------- HTML

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const firstName = (name: string) => name.split(" ")[0] ?? name;

function safeColor(color: string) {
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#171717";
}

function itemsTable(o: OrderForEmail) {
  const rows = o.order_items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${i.quantity}× ${esc(i.product_name)}${i.variant_name !== "Único" ? ` <span style="color:#737373">· ${esc(i.variant_name)}</span>` : ""}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatBRL(i.unit_price_cents * i.quantity)}</td>
      </tr>`,
    )
    .join("");
  const shippingLabel = o.shipping_method === "pickup" ? "Retirada na loja" : esc(o.shipping_method);
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding:8px 0;color:#525252">Subtotal</td><td style="padding:8px 0;text-align:right">${formatBRL(o.subtotal_cents)}</td></tr>
    <tr><td style="padding:0 0 8px;color:#525252">${shippingLabel}</td><td style="padding:0 0 8px;text-align:right">${o.shipping_cents ? formatBRL(o.shipping_cents) : "Grátis"}</td></tr>${
      o.discount_cents ? `
    <tr><td style="padding:0 0 8px;color:#047857">Desconto Pix</td><td style="padding:0 0 8px;text-align:right;color:#047857">−${formatBRL(o.discount_cents)}</td></tr>` : ""
    }
    <tr><td style="padding:8px 0;border-top:2px solid #171717;font-weight:bold">Total</td><td style="padding:8px 0;border-top:2px solid #171717;text-align:right;font-weight:bold">${formatBRL(o.total_cents)}</td></tr>
  </table>`;
}

function addressBlock(a: Record<string, string>) {
  return `<p style="margin:20px 0 0;font-size:14px;color:#525252"><strong style="color:#171717">Entregar em</strong><br>
    ${esc(a.street)}, ${esc(a.number)}${a.complement ? ` - ${esc(a.complement)}` : ""}<br>
    ${esc(a.district)} · ${esc(a.city)}/${esc(a.state)} · CEP ${esc(String(a.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</p>`;
}

function button(url: string, label: string, color: string) {
  return `<p style="margin:28px 0 0"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${safeColor(color)};color:#fff;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
}

function layout(o: OrderForEmail, body: string) {
  const color = safeColor(o.stores.primary_color);
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
    <table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 12px">
      <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="height:6px;background:${color}"></td></tr>
        <tr><td style="padding:24px 28px 0;font-size:18px;font-weight:bold">${esc(o.stores.name)}</td></tr>
        <tr><td style="padding:20px 28px 28px">${body}</td></tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:#a3a3a3">Loja criada com PMS app</p>
    </td></tr></table></body></html>`;
}
