import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/format";
import { platformUrl, storeBaseUrl } from "@/lib/urls";
import { type InvoiceKind, formatDay, invoiceTitle, lastPayDay } from "@/lib/billing";
import { googleCalendarUrl } from "@/lib/booking";
import { isLocalDelivery } from "@/lib/shipping-settings";
import { pushToStore } from "@/lib/push";
import { isPaymentLink } from "@/lib/payment-links";
import type { Report } from "@/lib/monthly-report";
import { progressText } from "@/lib/loyalty";
import { customerStamps, getLoyaltyConfig } from "@/lib/loyalty-data";

// E-mails transacionais via API do Resend. Sem RESEND_API_KEY, só registra no log (dev).
// EMAIL_FROM: endereço de um domínio verificado no Resend, ex.: pedidos@pmsapp.dev
// (para testes, "onboarding@resend.dev" envia só para o e-mail da sua conta Resend).

// track: guarda o envio em sent_emails para o webhook do Resend avisar se o e-mail voltou ou virou spam.
type Track = { kind: "order" | "store" | "invoice" | "proposal"; refId: string | null; storeId: string | null };
type Email = { to: string; subject: string; html: string; replyTo?: string | null; fromName: string; idempotencyKey: string; track?: Track };

async function sendEmail(email: Email) {
  return (await trySendEmail(email)) === null;
}

// Devolve null se enviou, ou o motivo da falha (para diagnóstico).
async function trySendEmail(email: Email): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  if (!apiKey) {
    console.log(`[e-mail não enviado: RESEND_API_KEY ausente] para ${email.to}: ${email.subject}`);
    // Desenvolvimento: EMAIL_PREVIEW_DIR guarda o HTML de cada e-mail para conferir o visual.
    const dir = process.env.EMAIL_PREVIEW_DIR;
    if (dir) {
      const { writeFile } = await import("node:fs/promises");
      const name = email.idempotencyKey.replace(/[^a-z0-9-]/gi, "_").slice(0, 80);
      await writeFile(`${dir}/${name}.html`, email.html).catch(() => {});
    }
    return null;
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
    const body = await res.text().catch(() => "");
    console.error("Resend recusou o e-mail", res.status, body);
    return `Resend ${res.status}: ${body.slice(0, 300)}`;
  }
  if (email.track) await trackEmail(email, (await res.json().catch(() => null)) as { id?: string } | null);
  return null;
}

// Registro do envio (se a tabela ainda não existir, o e-mail já saiu: só fica sem rastreio).
async function trackEmail(email: Email, sent: { id?: string } | null) {
  if (!sent?.id || !email.track) return;
  const { error } = await createAdminClient()
    .from("sent_emails")
    .upsert(
      { resend_id: sent.id, kind: email.track.kind, ref_id: email.track.refId, store_id: email.track.storeId, to_email: email.to, subject: email.subject },
      { onConflict: "resend_id", ignoreDuplicates: true },
    );
  if (error) console.error("E-mail enviado sem rastreio", error.message);
}

// ---------------------------------------------------------------- dados do pedido

type OrderForEmail = {
  id: string;
  store_id: string;
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
      "id, store_id, code, public_token, status, customer_name, customer_email, customer_phone, shipping_method, shipping_address, subtotal_cents, shipping_cents, discount_cents, total_cents, tracking_code, stock_issue, stores(name, email, whatsapp, primary_color, store_domains(domain, is_primary)), order_items(product_name, variant_name, unit_price_cents, quantity)",
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

// Conversa do lojista com o cliente no WhatsApp, com a mensagem já escrita (telefone salvo sem o 55).
function customerWhatsappUrl(o: OrderForEmail) {
  const text = `Olá, ${firstName(o.customer_name)}! Aqui é da ${o.stores.name}. Recebemos o pagamento do seu pedido ${o.code} e já estamos preparando. Qualquer dúvida, é só chamar por aqui.`;
  return `https://wa.me/55${o.customer_phone}?text=${encodeURIComponent(text)}`;
}

type OrderNotice = "notified_paid_at" | "notified_shipped_at" | "notified_refunded_at" | "notified_expired_at";

// Trava: só quem preencher a coluna envia. Se o envio falhar, libera para tentar de novo.
async function claim(orderId: string, column: OrderNotice, statuses: string[]) {
  const { data } = await createAdminClient()
    .from("orders")
    .update({ [column]: new Date().toISOString() })
    .eq("id", orderId)
    .is(column, null)
    .in("status", statuses)
    .select("id");
  return !!data?.length;
}

async function release(orderId: string, column: OrderNotice) {
  await createAdminClient().from("orders").update({ [column]: null }).eq("id", orderId);
}

// Cartão fidelidade: linha com o progresso do cliente nos e-mails de confirmação (vazia sem o programa).
async function loyaltyLine(storeId: string, email: string | null, phone: string | null) {
  try {
    const db = createAdminClient();
    const cfg = await getLoyaltyConfig(db, storeId);
    if (!cfg?.enabled) return "";
    const stamps = await customerStamps(db, storeId, cfg, { email, phone });
    return `<p style="margin:20px 0 0;padding:12px 14px;border-radius:8px;background:#f0fdf4;color:#166534">🎟️ ${esc(progressText(cfg, stamps))}</p>`;
  } catch {
    return "";
  }
}

// Completou o cartão fidelidade: e-mail para o cliente e aviso no celular da loja (a trava é a linha do prêmio).
export async function notifyLoyaltyReward(storeId: string, who: { name: string; email: string | null }, reward: string) {
  const { data: store } = await createAdminClient().from("stores").select("name, email, primary_color").eq("id", storeId).single();
  if (!store) return;
  if (who.email) {
    await sendEmail({
      to: who.email,
      fromName: store.name,
      replyTo: store.email,
      idempotencyKey: `loyalty-${storeId}-${who.email}-${Date.now()}`,
      subject: `🎁 Você ganhou: ${reward}`,
      html: layout(store, `
        <h1 style="margin:0 0 8px;font-size:22px">Você completou o cartão fidelidade! 🎁</h1>
        <p style="margin:0 0 16px;color:#525252">Olá, ${esc(firstName(who.name))}. Obrigado pela preferência! Você ganhou:</p>
        <p style="margin:0;padding:16px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:20px;font-weight:bold;text-align:center">${esc(reward)}</p>
        <p style="margin:16px 0 0;color:#525252">Mostre este e-mail na próxima visita ou compra para usar o seu prêmio.</p>`),
    });
  }
  await pushToStore(storeId, {
    title: "Cartão fidelidade completo 🎁",
    body: `${who.name} ganhou ${reward}. Entregue na próxima visita (Painel → Clientes).`,
    url: "/painel/clientes?dias=fidelidade",
    tag: `loyalty-${who.email ?? who.name}`,
  });
}

// ---------------------------------------------------------------- notificações

export async function notifyOrderPaid(orderId: string) {
  try {
    if (!(await claim(orderId, "notified_paid_at", ["paid", "preparing", "shipped", "delivered"]))) return;
    const o = await loadOrder(orderId);
    if (!o) return;
    const url = orderUrl(o);
    const loyalty = await loyaltyLine(o.store_id, o.customer_email, o.customer_phone);

    const customerOk = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `paid-${o.id}`,
      track: { kind: "order", refId: o.id, storeId: o.store_id },
      subject: `Pedido ${o.code} confirmado`,
      html: layout(o.stores, `
        <h1 style="margin:0 0 8px;font-size:22px">Pagamento confirmado!</h1>
        <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. Recebemos o pagamento do pedido <strong>${o.code}</strong>.
        ${isPaymentLink(o.shipping_method) ? `A ${esc(o.stores.name)} já foi avisada. Guarde este e-mail como comprovante.` : o.shipping_method === "pickup" ? "Avisaremos quando estiver pronto para retirada." : isLocalDelivery(o.shipping_method) ? "Avisaremos quando sair para entrega." : "Avisaremos quando for enviado, com o código de rastreio."}</p>
        ${itemsTable(o)}
        ${loyalty}
        ${o.shipping_address ? addressBlock(o.shipping_address) : ""}
        ${url ? button(url, "Acompanhar pedido", o.stores.primary_color) : ""}`),
    });

    if (o.stores.email) {
      await sendEmail({
        to: o.stores.email,
        fromName: "PMS app",
        idempotencyKey: `paid-store-${o.id}`,
        track: { kind: "store", refId: o.id, storeId: o.store_id },
        subject: `Nova venda: pedido ${o.code} (${formatBRL(o.total_cents)})`,
        html: layout(o.stores, `
          <h1 style="margin:0 0 8px;font-size:22px">Nova venda 🎉</h1>
          <p style="margin:0 0 20px;color:#525252">Pedido <strong>${o.code}</strong> pago por ${esc(o.customer_name)}
          (${esc(o.customer_email)}${o.customer_phone ? `, ${esc(formatPhone(o.customer_phone))}` : ""}).</p>
          ${o.stock_issue ? `<p style="margin:0 0 20px;padding:12px;border-radius:8px;background:#fef2f2;color:#991b1b">Atenção: faltou estoque de algum item na confirmação. Confira antes de enviar.</p>` : ""}
          ${o.customer_phone ? `${button(customerWhatsappUrl(o), "Falar com o cliente no WhatsApp", "#16a34a")}<div style="height:24px"></div>` : ""}
          ${itemsTable(o)}
          ${o.shipping_address ? addressBlock(o.shipping_address) : ""}
          <p style="margin:20px 0 0;color:#525252">Veja os detalhes no painel da loja.</p>`),
      });
    }

    // Aviso no celular do lojista (push). Só na tentativa que valeu: se o e-mail do cliente falhar, a trava é
    // liberada e a próxima tentativa avisa (sem tocar o celular de novo a cada repetição).
    if (!customerOk) {
      await release(orderId, "notified_paid_at");
      return;
    }
    const units = o.order_items.reduce((n, i) => n + i.quantity, 0);
    await pushToStore(o.store_id, {
      title: `Nova venda: ${formatBRL(o.total_cents)}`,
      body: isPaymentLink(o.shipping_method)
        ? `Link "${o.order_items[0]?.product_name}" · ${o.customer_name}`
        : `Pedido ${o.code} · ${o.customer_name} · ${units} ${units === 1 ? "item" : "itens"}${o.stock_issue ? " · ATENÇÃO: faltou estoque" : ""}`,
      url: `/painel/pedidos/${o.id}`,
      tag: `order-${o.id}`,
    });
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
    const local = isLocalDelivery(o.shipping_method);

    const ok = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `shipped-${o.id}`,
      track: { kind: "order", refId: o.id, storeId: o.store_id },
      subject: pickup ? `Pedido ${o.code} pronto para retirada` : local ? `Pedido ${o.code} saiu para entrega` : `Pedido ${o.code} enviado`,
      html: layout(o.stores, (pickup
        ? `<h1 style="margin:0 0 8px;font-size:22px">Pronto para retirada!</h1>
           <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. Seu pedido <strong>${o.code}</strong> já pode ser retirado na loja.
           ${o.stores.whatsapp ? `Dúvidas? Fale com a gente pelo <a href="https://wa.me/${o.stores.whatsapp}">WhatsApp</a>.` : ""}</p>`
        : local
        ? `<h1 style="margin:0 0 8px;font-size:22px">Seu pedido saiu para entrega!</h1>
           <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. A loja está levando o pedido <strong>${o.code}</strong> até você.
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

// Pedido cancelado com estorno pelo painel: avisa o cliente de quando o dinheiro volta.
export async function notifyOrderRefunded(orderId: string, method: "pix" | "card") {
  try {
    if (!(await claim(orderId, "notified_refunded_at", ["canceled"]))) return;
    const o = await loadOrder(orderId);
    if (!o) return;
    const when =
      method === "pix"
        ? "Como o pagamento foi por Pix, o valor volta para a sua conta em instantes."
        : "Como o pagamento foi no cartão, o valor aparece como crédito na fatura em até 2 faturas, conforme o banco.";
    const ok = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `refunded-${o.id}`,
      track: { kind: "order", refId: o.id, storeId: o.store_id },
      subject: `Pedido ${o.code} cancelado e estornado`,
      html: layout(o.stores, `
        <h1 style="margin:0 0 8px;font-size:22px">Pedido cancelado e estornado</h1>
        <p style="margin:0 0 20px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. O pedido <strong>${o.code}</strong> foi cancelado e
        devolvemos <strong>${formatBRL(o.total_cents)}</strong>. ${when}</p>
        ${itemsTable(o)}
        ${o.stores.whatsapp ? `<p style="margin:20px 0 0;color:#525252">Dúvidas? Fale com a gente pelo <a href="https://wa.me/${o.stores.whatsapp}">WhatsApp</a>.</p>` : ""}`),
    });
    if (!ok) await release(orderId, "notified_refunded_at");
  } catch (err) {
    console.error("Falha ao notificar estorno", { orderId, err });
  }
}

// Pedido que expirou sem pagamento (Pix vencido, cartão recusado): segunda chance, um e-mail por pedido.
// O link abre a página do pedido com ?refazer=1, que monta o carrinho de novo e leva ao checkout já preenchido.
export async function notifyOrderExpired(orderId: string) {
  try {
    if (!(await claim(orderId, "notified_expired_at", ["expired"]))) return false;
    const o = await loadOrder(orderId);
    const url = o && orderUrl(o);
    if (!o || !url) return false;
    const items = o.order_items
      .map((i) => `<li style="padding:4px 0">${i.quantity}× ${esc(i.product_name)}${i.variant_name !== "Único" ? ` <span style="color:#737373">· ${esc(i.variant_name)}</span>` : ""}</li>`)
      .join("");
    const ok = await sendEmail({
      to: o.customer_email,
      fromName: o.stores.name,
      replyTo: o.stores.email,
      idempotencyKey: `expired-${o.id}`,
      track: { kind: "order", refId: o.id, storeId: o.store_id },
      subject: `Ainda dá tempo: finalize seu pedido na ${o.stores.name}`,
      html: layout(o.stores, `
        <h1 style="margin:0 0 8px;font-size:22px">Seu pedido ficou pela metade</h1>
        <p style="margin:0 0 16px;color:#525252">Olá, ${esc(firstName(o.customer_name))}. O prazo para pagar o pedido <strong>${o.code}</strong> acabou
        antes do pagamento, mas os produtos ainda estão disponíveis. É só um clique para refazer, com seus dados já preenchidos.</p>
        <ul style="margin:0;padding:0 0 0 18px;font-size:14px">${items}</ul>
        ${button(`${url}?refazer=1`, "Finalizar minha compra", o.stores.primary_color)}
        <p style="margin:24px 0 0;font-size:12px;color:#a3a3a3">Preço e frete são conferidos de novo ao finalizar. Se você já comprou, ignore este e-mail. É um aviso único.</p>`),
    });
    if (!ok) await release(orderId, "notified_expired_at");
    return ok;
  } catch (err) {
    console.error("Falha ao avisar pedido expirado", { orderId, err });
    return false;
  }
}

// ---------------------------------------------------------------- agendamentos

type BookingForEmail = {
  id: string;
  store_id: string;
  code: string;
  public_token: string;
  status: string;
  service_name: string;
  professional_name: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  price_cents: number;
  online_cents: number;
  paid_cents: number;
  stores: { name: string; email: string | null; whatsapp: string | null; primary_color: string; address: string | null; store_domains: { domain: string; is_primary: boolean }[] };
};

export type BookingNotice = "confirmed" | "reminder" | "canceled" | "store";
const BOOKING_COLUMN: Record<BookingNotice, string> = {
  confirmed: "notified_confirmed_at",
  reminder: "notified_reminder_at",
  canceled: "notified_canceled_at",
  store: "notified_store_at",
};

const bookingWhen = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${day}, às ${time}`;
};

function bookingSummary(b: BookingForEmail) {
  const remaining = b.price_cents - b.paid_cents;
  return `<p style="margin:0 0 4px;padding:14px;border-radius:8px;background:#f5f5f5;font-size:15px">
    <strong>${esc(b.service_name)}</strong><br>${esc(bookingWhen(b.starts_at))}<br>com ${esc(b.professional_name)}
    ${b.stores.address ? `<br><span style="color:#525252">${esc(b.stores.address)}</span>` : ""}
    <br><span style="color:#525252">${b.paid_cents ? `Pago online: ${formatBRL(b.paid_cents)} · ` : ""}${remaining > 0 ? `a pagar no salão: ${formatBRL(remaining)}` : "tudo pago"}</span></p>`;
}

// E-mails do agendamento, cada um uma vez (colunas notified_*). "store" vai para o lojista.
// rescheduled: aviso de remarcação (sem trava: cada nova data gera um e-mail próprio).
// by: quem cancelou (o lojista não recebe no celular o aviso do cancelamento que ele mesmo fez).
export async function notifyBooking(bookingId: string, notice: BookingNotice | "rescheduled", by: "customer" | "store" = "customer") {
  const db = createAdminClient();
  try {
    const column = notice === "rescheduled" ? null : BOOKING_COLUMN[notice];
    if (column) {
      const { data: claimed } = await db.from("bookings").update({ [column]: new Date().toISOString() }).eq("id", bookingId).is(column, null).select("id");
      if (!claimed?.length) return;
    }
    // Endereço da loja (coluna de Dados da empresa) lido à parte: sem ela, o e-mail sai sem endereço.
    const { data } = await db
      .from("bookings")
      .select("id, code, public_token, status, service_name, professional_name, starts_at, ends_at, customer_name, customer_email, customer_phone, notes, price_cents, online_cents, paid_cents, store_id, stores(name, email, whatsapp, primary_color, store_domains(domain, is_primary))")
      .eq("id", bookingId)
      .single();
    if (!data) return;
    const { data: legal } = await db.from("stores").select("address").eq("id", data.store_id).maybeSingle();
    const b = { ...data, stores: { ...(data.stores as unknown as BookingForEmail["stores"]), address: (legal as { address: string | null } | null)?.address ?? null } } as unknown as BookingForEmail;
    const domain = (b.stores.store_domains.find((d) => d.is_primary) ?? b.stores.store_domains[0])?.domain;
    const link = domain ? `${storeBaseUrl(domain)}/agendamento/${b.public_token}` : null;
    const calendar = googleCalendarUrl({ title: `${b.service_name} · ${b.stores.name}`, startsAt: b.starts_at, endsAt: b.ends_at, location: b.stores.address ?? undefined, details: link ?? undefined });
    const manage = link ? button(link, "Ver, remarcar ou cancelar", b.stores.primary_color) : "";
    const cal = `<p style="margin:12px 0 0;font-size:13px"><a href="${esc(calendar)}" style="color:#525252">Adicionar ao Google Agenda</a></p>`;
    const whats = b.stores.whatsapp ? `<p style="margin:16px 0 0;color:#525252;font-size:13px">Dúvidas? <a href="https://wa.me/${b.stores.whatsapp}">Fale com a gente pelo WhatsApp</a>.</p>` : "";
    const hi = `Olá, ${esc(firstName(b.customer_name))}.`;

    // Aviso no celular do lojista (push), independente dos e-mails: novo, remarcado ou cancelado pelo cliente.
    const push = {
      store: "Novo agendamento 📅",
      rescheduled: "Agendamento remarcado",
      canceled: by === "customer" ? "Agendamento cancelado" : null,
      confirmed: null,
      reminder: null,
    }[notice];
    if (push) {
      const day = new Date(b.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
      await pushToStore(b.store_id, {
        title: push,
        body: `${b.customer_name} · ${b.service_name} · ${bookingWhen(b.starts_at)}${notice === "canceled" ? " · horário liberado" : ""}`,
        url: `/painel/agenda?dia=${day}`,
        tag: `booking-${b.id}`,
      });
    }

    if (notice === "store") {
      if (!b.stores.email) return;
      await sendEmail({
        to: b.stores.email,
        fromName: "PMS app",
        idempotencyKey: `booking-store-${b.id}`,
        subject: `Novo agendamento: ${b.service_name} · ${bookingWhen(b.starts_at)}`,
        html: layout(b.stores, `
          <h1 style="margin:0 0 8px;font-size:22px">Novo agendamento 📅</h1>
          <p style="margin:0 0 16px;color:#525252">${esc(b.customer_name)}${b.customer_phone ? ` · ${esc(formatPhone(b.customer_phone))}` : ""}${b.customer_email ? ` · ${esc(b.customer_email)}` : ""}</p>
          ${bookingSummary(b)}
          ${b.notes ? `<p style="margin:12px 0 0;color:#525252">Observação: ${esc(b.notes)}</p>` : ""}
          ${b.customer_phone ? button(`https://wa.me/55${b.customer_phone}`, "Falar com o cliente no WhatsApp", "#16a34a") : ""}
          <p style="margin:20px 0 0;color:#525252">Veja a agenda no painel da loja.</p>`),
      });
      return;
    }
    if (!b.customer_email) return;

    const content = {
      confirmed: { subject: `Agendamento confirmado: ${b.service_name}`, body: `<h1 style="margin:0 0 8px;font-size:22px">Agendamento confirmado ✅</h1><p style="margin:0 0 16px;color:#525252">${hi} Seu horário está garantido.</p>${bookingSummary(b)}${manage}${cal}${whats}` },
      rescheduled: { subject: `Agendamento remarcado: ${b.service_name}`, body: `<h1 style="margin:0 0 8px;font-size:22px">Agendamento remarcado</h1><p style="margin:0 0 16px;color:#525252">${hi} Seu novo horário:</p>${bookingSummary(b)}${manage}${cal}${whats}` },
      reminder: { subject: `Lembrete: ${b.service_name} amanhã`, body: `<h1 style="margin:0 0 8px;font-size:22px">Até amanhã! ⏰</h1><p style="margin:0 0 16px;color:#525252">${hi} Lembrando do seu horário:</p>${bookingSummary(b)}${manage}${whats}` },
      canceled: {
        subject: `Agendamento cancelado: ${b.service_name}`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Agendamento cancelado</h1><p style="margin:0 0 16px;color:#525252">${hi} O agendamento abaixo foi cancelado.${b.paid_cents ? ` Devolvemos ${formatBRL(b.paid_cents)} pelo Mercado Pago (Pix: na hora; cartão: na fatura).` : ""}</p>${bookingSummary(b)}${domain ? button(`${storeBaseUrl(domain)}/agendar`, "Agendar outro horário", b.stores.primary_color) : ""}${whats}`,
      },
    }[notice];

    const ok = await sendEmail({
      to: b.customer_email,
      fromName: b.stores.name,
      replyTo: b.stores.email,
      idempotencyKey: `booking-${notice}-${b.id}-${notice === "rescheduled" ? b.starts_at : ""}`,
      subject: content.subject,
      // Confirmação: mostra o cartão fidelidade do cliente (o atendimento carimba quando é marcado "atendido").
      html: layout(b.stores, notice === "confirmed" ? content.body + (await loyaltyLine(b.store_id, b.customer_email, b.customer_phone)) : content.body),
    });
    if (!ok && column) await db.from("bookings").update({ [column]: null }).eq("id", bookingId);
    // Remarcação: o lojista também fica sabendo.
    if (notice === "rescheduled" && b.stores.email) {
      await sendEmail({
        to: b.stores.email,
        fromName: "PMS app",
        idempotencyKey: `booking-rescheduled-store-${b.id}-${b.starts_at}`,
        subject: `Agendamento remarcado: ${b.customer_name} · ${bookingWhen(b.starts_at)}`,
        html: layout(b.stores, `<h1 style="margin:0 0 8px;font-size:22px">Agendamento remarcado</h1><p style="margin:0 0 16px;color:#525252">${esc(b.customer_name)} remarcou para:</p>${bookingSummary(b)}`),
      });
    }
    // Cancelamento: o lojista também fica sabendo (libera o horário na agenda dele).
    if (notice === "canceled" && b.stores.email) {
      await sendEmail({
        to: b.stores.email,
        fromName: "PMS app",
        idempotencyKey: `booking-canceled-store-${b.id}`,
        subject: `Agendamento cancelado: ${b.customer_name} · ${bookingWhen(b.starts_at)}`,
        html: layout(b.stores, `<h1 style="margin:0 0 8px;font-size:22px">Agendamento cancelado</h1><p style="margin:0 0 16px;color:#525252">O agendamento de ${esc(b.customer_name)} foi cancelado e o horário voltou a ficar livre.${b.paid_cents ? ` Estornamos ${formatBRL(b.paid_cents)} pelo Mercado Pago.` : ""}</p>${bookingSummary(b)}`),
      });
    }
  } catch (err) {
    console.error("Falha ao avisar agendamento", { bookingId, notice, err });
  }
}

// Lista de espera: abriu horário no dia que a pessoa queria. A trava é o notified_at (marcado por notifyWaitlist).
export async function notifyWaitlistOpening(entryId: string, freeTimes: string[]) {
  try {
    const { data } = await createAdminClient()
      .from("booking_waitlist")
      .select("id, store_id, service_id, professional_id, date, customer_name, customer_email, services(name), professionals(name), stores(name, email, whatsapp, primary_color, store_domains(domain, is_primary))")
      .eq("id", entryId)
      .single();
    if (!data) return false;
    const e = data as unknown as {
      id: string;
      service_id: string;
      date: string;
      customer_name: string;
      customer_email: string;
      services: { name: string } | null;
      professionals: { name: string } | null;
      stores: { name: string; email: string | null; whatsapp: string | null; primary_color: string; store_domains: { domain: string; is_primary: boolean }[] };
    };
    const domain = (e.stores.store_domains.find((d) => d.is_primary) ?? e.stores.store_domains[0])?.domain;
    if (!domain) return false;
    const day = new Date(`${e.date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    const service = e.services?.name ?? "o serviço";
    const times = freeTimes.slice(0, 8).join(", ") + (freeTimes.length > 8 ? " e outros" : "");
    return await sendEmail({
      to: e.customer_email,
      fromName: e.stores.name,
      replyTo: e.stores.email,
      idempotencyKey: `waitlist-${e.id}-${Date.now()}`,
      subject: `Abriu horário: ${service} em ${day}`,
      html: layout(e.stores, `
        <h1 style="margin:0 0 8px;font-size:22px">Abriu um horário! ⏰</h1>
        <p style="margin:0 0 16px;color:#525252">Olá, ${esc(firstName(e.customer_name))}. Você está na lista de espera da ${esc(e.stores.name)} para
        <strong>${esc(service)}</strong>${e.professionals ? ` com ${esc(e.professionals.name)}` : ""} em <strong>${esc(day)}</strong>, e acabou de abrir horário.</p>
        <p style="margin:0 0 4px;padding:14px;border-radius:8px;background:#f5f5f5;font-size:15px">Horários livres agora: <strong>${esc(times)}</strong></p>
        ${button(`${storeBaseUrl(domain)}/agendar?servico=${e.service_id}&data=${e.date}`, "Agendar agora", e.stores.primary_color)}
        <p style="margin:24px 0 0;font-size:12px;color:#a3a3a3">Quem agendar primeiro leva o horário. Se não der desta vez, você continua na lista e avisamos de novo se abrir outro.</p>`),
    });
  } catch (err) {
    console.error("Falha ao avisar a lista de espera", { entryId, err });
    return false;
  }
}

// ---------------------------------------------------------------- avise-me quando chegar

type PendingAlert = {
  id: string;
  email: string;
  product_variants: { name: string; price_cents: number; stock: number; active: boolean; products: { name: string; slug: string; active: boolean } };
};

// Avisa quem pediu "avise-me" nas opções da loja que voltaram ao estoque (cada pedido sai uma vez).
// Chamado depois de salvar o estoque no painel e de um estorno que devolve itens. Nunca lança erro.
export async function notifyBackInStock(storeId: string) {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("stock_alerts")
      .select("id, email, product_variants!inner(name, price_cents, stock, active, products!inner(name, slug, active))")
      .eq("store_id", storeId)
      .is("notified_at", null)
      .gt("product_variants.stock", 0)
      .eq("product_variants.active", true)
      .eq("product_variants.products.active", true)
      .limit(200);
    const alerts = (data ?? []) as unknown as PendingAlert[];
    if (!alerts.length) return;

    const { data: store } = await db.from("stores").select("name, email, primary_color, store_domains(domain, is_primary)").eq("id", storeId).single();
    if (!store) return;
    const domains = store.store_domains as { domain: string; is_primary: boolean }[];
    const domain = (domains.find((d) => d.is_primary) ?? domains[0])?.domain;
    if (!domain) return;

    for (const a of alerts) {
      // Trava: só quem marcar notified_at envia.
      const { data: claimed } = await db.from("stock_alerts").update({ notified_at: new Date().toISOString() }).eq("id", a.id).is("notified_at", null).select("id");
      if (!claimed?.length) continue;
      const v = a.product_variants;
      const name = v.name === "Único" ? v.products.name : `${v.products.name} (${v.name})`;
      const ok = await sendEmail({
        to: a.email,
        fromName: store.name,
        replyTo: store.email,
        idempotencyKey: `back-in-stock-${a.id}`,
        subject: `${v.products.name} voltou ao estoque`,
        html: layout(store, `
          <h1 style="margin:0 0 8px;font-size:22px">Chegou! 🎉</h1>
          <p style="margin:0 0 20px;color:#525252">Você pediu para avisar quando <strong>${esc(name)}</strong> voltasse ao estoque. Ele está de volta,
          por ${formatBRL(v.price_cents)}. Garanta o seu antes que acabe de novo.</p>
          ${button(`${storeBaseUrl(domain)}/p/${v.products.slug}`, "Ver produto", store.primary_color)}
          <p style="margin:24px 0 0;font-size:12px;color:#a3a3a3">Você recebeu este e-mail porque pediu o aviso na loja. É um aviso único.</p>`),
      });
      if (!ok) await db.from("stock_alerts").update({ notified_at: null }).eq("id", a.id);
    }
  } catch (err) {
    console.error("Falha ao avisar reposição de estoque", { storeId, err });
  }
}

// ---------------------------------------------------------------- cobrança da plataforma (faturas do lojista)

export type InvoiceNotice = "issued" | "overdue" | "warning" | "suspended" | "paid";

type InvoiceForEmail = {
  id: string;
  store_id: string;
  kind: InvoiceKind;
  reference_month: string | null;
  amount_cents: number;
  due_date: string;
  stores: { name: string; email: string | null };
};

const PLATFORM_BRAND = { name: "PMS app", primary_color: "#0a2e82" };

// Sem e-mail da loja (o lojista pode apagar em Configurações), a cobrança vai para o login do dono.
async function ownerEmail(storeId: string) {
  const db = createAdminClient();
  const { data: owner } = await db.from("store_members").select("user_id").eq("store_id", storeId).eq("role", "owner").order("created_at").limit(1).maybeSingle();
  if (!owner) return null;
  const { data } = await db.auth.admin.getUserById(owner.user_id);
  return data.user?.email ?? null;
}

// Resumo do mês para o dono da loja (rotina do dia 1). A trava fica em store_monthly_reports.
export async function sendMonthlyReport(storeId: string, m: { month: string; label: string; name: string }, r: Report) {
  const to = await ownerEmail(storeId);
  const { data: store } = await createAdminClient().from("stores").select("name, primary_color").eq("id", storeId).single();
  if (!to || !store) return false;
  const stat = (label: string, value: string, note = "") =>
    `<td style="width:50%;padding:6px;vertical-align:top"><div style="padding:14px;border-radius:10px;background:#f5f5f5">
      <div style="font-size:12px;color:#737373">${label}</div><div style="margin-top:4px;font-size:20px;font-weight:bold">${value}</div>${note ? `<div style="margin-top:2px;font-size:12px">${note}</div>` : ""}</div></td>`;
  const change =
    r.changePercent == null ? "" : r.changePercent >= 0
      ? `<span style="color:#047857">▲ ${r.changePercent}% sobre o mês anterior</span>`
      : `<span style="color:#b91c1c">▼ ${Math.abs(r.changePercent)}% sobre o mês anterior</span>`;
  const bestDay = r.bestDay ? new Date(`${r.bestDay.date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" }) : "";
  const agenda = r.attended + r.noShows + r.canceled > 0;
  // Quadros de dois em dois; "Você recebeu" só com a taxa de todas as vendas, "Atendimentos" só com agenda.
  const stats = [
    stat("Vendas", formatBRL(r.salesCents), change),
    stat("Pedidos pagos", String(r.orders), r.orders ? `ticket médio ${formatBRL(r.avgTicketCents)}` : ""),
    r.netCents != null && stat("Você recebeu (já sem taxas)", formatBRL(r.netCents), `taxas do Mercado Pago: ${formatBRL(r.feeCents)}`),
    agenda && stat("Atendimentos", String(r.attended), `${r.noShows} falta${r.noShows === 1 ? "" : "s"} · ${r.canceled} cancelado${r.canceled === 1 ? "" : "s"}`),
    stat("Clientes novos", String(r.newCustomers)),
  ].filter(Boolean) as string[];
  const rows = Array.from({ length: Math.ceil(stats.length / 2) }, (_, i) => `<tr>${stats[2 * i]}${stats[2 * i + 1] ?? "<td></td>"}</tr>`).join("");
  const html = layout(store, `
    <h1 style="margin:0 0 4px;font-size:22px">Seu resumo de ${esc(m.name)} 📊</h1>
    <p style="margin:0 0 16px;color:#525252">Como foi ${esc(m.label)} na ${esc(store.name)}.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 -6px">${rows}</table>
    ${bestDay ? `<p style="margin:16px 0 0;color:#525252">Melhor dia: <strong>${esc(bestDay)}</strong>, com ${formatBRL(r.bestDay!.cents)} em vendas.</p>` : ""}
    ${r.top.length ? `<p style="margin:20px 0 6px;font-weight:bold">Mais vendidos</p><ol style="margin:0;padding-left:20px;color:#404040">${r.top
      .map((t) => `<li style="padding:2px 0">${esc(t.name)} · ${t.quantity} un. · ${formatBRL(t.cents)}</li>`)
      .join("")}</ol>` : ""}
    ${r.awayCustomers > 0 ? `<p style="margin:20px 0 0;padding:14px;border-radius:8px;background:#fffbeb;color:#78350f">${r.awayCustomers} cliente${r.awayCustomers === 1 ? " não volta" : "s não voltam"} há mais de 60 dias. Uma mensagem no WhatsApp costuma trazer de volta.</p>
      ${button(platformUrl("/painel/clientes"), "Chamar clientes de volta", "#16a34a")}` : ""}
    ${button(platformUrl("/painel"), "Abrir o painel", store.primary_color)}`);
  return sendEmail({
    to,
    fromName: "PMS app",
    idempotencyKey: `monthly-${storeId}-${m.month}`,
    track: { kind: "store", refId: null, storeId },
    subject: `Resumo de ${m.name}: ${formatBRL(r.salesCents)} em vendas${agenda ? `, ${r.attended} atendimento${r.attended === 1 ? "" : "s"}` : ""}`,
    html,
  });
}

// Cada aviso sai uma vez por fatura (coluna notified_<aviso>_at).
// Devolve sent=true se enviou agora; error explica a falha (já avisado antes não é erro).
export async function notifyInvoice(invoiceId: string, notice: InvoiceNotice): Promise<{ sent: boolean; error?: string }> {
  const column = `notified_${notice}_at`;
  const db = createAdminClient();
  try {
    const { data } = await db
      .from("store_invoices")
      .update({ [column]: new Date().toISOString() })
      .eq("id", invoiceId)
      .is(column, null)
      .eq("status", notice === "paid" ? "paid" : "open")
      .select("id, store_id, kind, reference_month, amount_cents, due_date, stores(name, email)");
    const inv = data?.[0] as unknown as InvoiceForEmail | undefined;
    if (!inv) return { sent: false };

    const title = invoiceTitle(inv);
    const value = formatBRL(inv.amount_cents);
    const due = formatDay(inv.due_date);
    const limit = formatDay(lastPayDay(inv.due_date));
    const pay = button(platformUrl("/painel/assinatura"), "Pagar fatura", PLATFORM_BRAND.primary_color);
    const summary = `<p style="margin:0 0 4px;padding:14px;border-radius:8px;background:#f5f5f5;font-size:15px">${esc(title)}<br>
      <strong style="font-size:20px">${value}</strong><br><span style="color:#525252">vencimento ${due}</span></p>`;
    const hello = `<p style="margin:0 0 16px;color:#525252">Olá, ${esc(inv.stores.name)}.`;
    const content: Record<InvoiceNotice, { subject: string; body: string }> = {
      issued: {
        subject: `Sua fatura do PMS app: ${title} (${value})`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Fatura disponível</h1>
          ${hello} A fatura abaixo já pode ser paga por Pix, cartão ou boleto.</p>${summary}${pay}`,
      },
      overdue: {
        subject: `Fatura vencida: ${title}`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Fatura vencida</h1>
          ${hello} Não identificamos o pagamento da fatura abaixo. Pague até <strong>${limit}</strong> para a loja continuar no ar.</p>${summary}${pay}`,
      },
      warning: {
        subject: `Último aviso: sua loja será suspensa depois de ${limit}`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Sua loja será suspensa</h1>
          ${hello} A fatura abaixo continua em aberto. Se não for paga até <strong>${limit}</strong>, a loja sai do ar até o pagamento.</p>${summary}${pay}`,
      },
      suspended: {
        subject: `Sua loja ${inv.stores.name} foi suspensa`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Loja suspensa por falta de pagamento</h1>
          ${hello} A loja saiu do ar porque a fatura abaixo passou de 20 dias de atraso. O painel continua funcionando.
          Assim que o pagamento for confirmado, a loja volta ao ar sozinha.</p>${summary}${pay}`,
      },
      paid: {
        subject: `Pagamento recebido: ${title}`,
        body: `<h1 style="margin:0 0 8px;font-size:22px">Pagamento recebido. Obrigado!</h1>
          ${hello} Confirmamos o pagamento de <strong>${esc(title)}</strong> (${value}).</p>
          ${button(platformUrl("/painel/assinatura"), "Ver faturas", PLATFORM_BRAND.primary_color)}`,
      },
    };

    const email = content[notice];
    const to = inv.stores.email || (await ownerEmail(inv.store_id));
    const error = to
      ? await trySendEmail({
          to,
          fromName: "PMS app",
          idempotencyKey: `invoice-${notice}-${inv.id}`,
          track: { kind: "invoice", refId: inv.id, storeId: inv.store_id },
          subject: email.subject,
          html: layout(PLATFORM_BRAND, email.body),
        })
      : "loja sem e-mail e sem dono";
    if (error) {
      console.error("Aviso de fatura não enviado", { invoiceId, notice, error });
      await db.from("store_invoices").update({ [column]: null }).eq("id", invoiceId);
      await notifyPlatformError(`fatura:email:${notice}`, "E-mail de cobrança não enviado", { loja: inv.stores.name, fatura: invoiceId, aviso: notice, motivo: error });
    }

    // Cópia para a plataforma: dinheiro que entrou e loja que saiu do ar.
    const alertTo = process.env.ALERT_EMAIL;
    if (alertTo && (notice === "paid" || notice === "suspended")) {
      await sendEmail({
        to: alertTo,
        fromName: "PMS app cobrança",
        idempotencyKey: `invoice-${notice}-${inv.id}-plataforma`,
        subject: notice === "paid" ? `${inv.stores.name} pagou ${title} (${value})` : `${inv.stores.name} foi suspensa por atraso`,
        html: layout(PLATFORM_BRAND, `<p style="margin:0">${esc(inv.stores.name)} · ${esc(title)} · ${value} · vencimento ${due}</p>`),
      });
    }
    return error ? { sent: false, error } : { sent: true };
  } catch (err) {
    console.error("Falha ao avisar fatura", { invoiceId, notice, err });
    return { sent: false, error: String(err) };
  }
}

// ---------------------------------------------------------------- propostas comerciais

type ProposalForEmail = { id: string; client_name: string; business_name: string; email: string | null; setup_fee_cents: number; monthly_fee_cents: number; valid_until: string };

const feeLabel = (cents: number) => (cents ? formatBRL(cents) : "isenta");

// Envia a proposta ao cliente. Devolve null se enviou, ou o motivo da falha.
export async function sendProposalEmail(p: ProposalForEmail, url: string): Promise<string | null> {
  if (!p.email) return "a proposta não tem e-mail do cliente";
  return trySendEmail({
    to: p.email,
    fromName: "PMS app",
    idempotencyKey: `proposal-${p.id}-${Date.now()}`, // reenviar é permitido
    track: { kind: "proposal", refId: p.id, storeId: null },
    subject: `Proposta da loja virtual para ${p.business_name}`,
    html: layout(PLATFORM_BRAND, `
      <h1 style="margin:0 0 8px;font-size:22px">Sua proposta de loja virtual</h1>
      <p style="margin:0 0 16px;color:#525252">Olá, ${esc(firstName(p.client_name))}! Preparamos a proposta da loja virtual da <strong>${esc(p.business_name)}</strong>.</p>
      <p style="margin:0 0 4px;padding:14px;border-radius:8px;background:#f5f5f5;font-size:15px">
        Implantação: <strong>${feeLabel(p.setup_fee_cents)}</strong><br>
        Mensalidade: <strong>${feeLabel(p.monthly_fee_cents)}</strong><br>
        <span style="color:#525252">válida até ${formatDay(p.valid_until)}</span></p>
      ${button(url, "Ver a proposta completa", PLATFORM_BRAND.primary_color)}`),
  });
}

// Avisa a plataforma (ALERT_EMAIL) que o cliente aceitou.
export async function notifyProposalAccepted(p: ProposalForEmail, adminUrl: string) {
  const to = process.env.ALERT_EMAIL;
  if (!to) return;
  await trySendEmail({
    to,
    fromName: "PMS app propostas",
    idempotencyKey: `proposal-accepted-${p.id}`,
    subject: `${p.business_name} aceitou a proposta`,
    html: layout(PLATFORM_BRAND, `
      <h1 style="margin:0 0 8px;font-size:22px">Proposta aceita 🎉</h1>
      <p style="margin:0 0 16px;color:#525252">${esc(p.client_name)} (${esc(p.business_name)}) aceitou a proposta: implantação ${feeLabel(p.setup_fee_cents)},
      mensalidade ${feeLabel(p.monthly_fee_cents)}.${p.email ? ` E-mail: ${esc(p.email)}.` : ""}</p>
      ${button(adminUrl, "Abrir no admin", PLATFORM_BRAND.primary_color)}`),
  }).catch((err) => console.error("Falha ao avisar proposta aceita", err));
}

// ---------------------------------------------------------------- alertas da plataforma

const ALERT_WINDOW_MINUTES = 30;

// Avisa a plataforma (ALERT_EMAIL) quando algo crítico falha: pagamento, webhook, criação de pedido.
// No máximo 1 e-mail por tipo de erro a cada 30 min (error_alert_claim conta as repetições).
// Nunca lança erro: um alerta não pode derrubar a requisição do cliente. Não passe credenciais em details.
export async function notifyPlatformError(key: string, title: string, details: Record<string, unknown>) {
  const to = process.env.ALERT_EMAIL;
  if (!to) return;
  try {
    const { data: repeats, error } = await createAdminClient().rpc("error_alert_claim", {
      p_key: key,
      p_minutes: ALERT_WINDOW_MINUTES,
    });
    if (error) {
      console.error("error_alert_claim falhou", error.message);
      return;
    }
    if (repeats === -1) return; // já avisado há menos de 30 min

    const rows = Object.entries(details)
      .map(([k, v]) => {
        const text = typeof v === "string" ? v : JSON.stringify(v);
        return `<tr><td style="padding:6px 12px 6px 0;color:#737373;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-family:monospace;font-size:12px;word-break:break-all">${esc(String(text ?? "").slice(0, 2000))}</td></tr>`;
      })
      .join("");
    const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await sendEmail({
      to,
      fromName: "PMS app alertas",
      idempotencyKey: `alert-${key}-${Date.now()}`,
      subject: `Alerta: ${title}`,
      html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
        <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border-top:6px solid #b42318">
          <h1 style="margin:0 0 8px;font-size:20px">${esc(title)}</h1>
          <p style="margin:0 0 16px;color:#525252">${esc(when)} · tipo <code>${esc(key)}</code> · ambiente ${esc(process.env.VERCEL_ENV ?? "local")}${
            repeats ? ` · repetiu ${repeats}× desde o último alerta` : ""
          }</p>
          <table style="border-collapse:collapse;font-size:14px">${rows}</table>
          <p style="margin:20px 0 0;font-size:12px;color:#a3a3a3">Novos erros deste tipo nos próximos ${ALERT_WINDOW_MINUTES} minutos só são contados. Detalhes completos nos logs da Vercel.</p>
        </div></body></html>`,
    });
  } catch (err) {
    console.error("Falha ao enviar alerta", err);
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
    ${isPaymentLink(o.shipping_method) ? "" : `<tr><td style="padding:0 0 8px;color:#525252">${shippingLabel}</td><td style="padding:0 0 8px;text-align:right">${o.shipping_cents ? formatBRL(o.shipping_cents) : "Grátis"}</td></tr>`}${
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

function layout(store: { name: string; primary_color: string }, body: string) {
  const color = safeColor(store.primary_color);
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
    <table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 12px">
      <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="height:6px;background:${color}"></td></tr>
        <tr><td style="padding:24px 28px 0;font-size:18px;font-weight:bold">${esc(store.name)}</td></tr>
        <tr><td style="padding:20px 28px 28px">${body}</td></tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:#a3a3a3">Loja criada com <a href="${esc(platformUrl())}" style="color:#a3a3a3">PMS app</a></p>
    </td></tr></table></body></html>`;
}
