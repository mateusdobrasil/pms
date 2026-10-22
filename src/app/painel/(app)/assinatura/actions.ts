"use server";

import { redirect } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { notifyPlatformError } from "@/lib/email";
import { INVOICE_FIELDS, type InvoiceRow, invoicePaymentUrl, platformAccessToken } from "@/lib/billing-server";

// Abre o pagamento da fatura no Mercado Pago (Pix, cartão ou boleto).
export async function payInvoice(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("invoiceId") ?? "");
  if (!isUuid(id)) redirect("/painel/assinatura");

  // RLS: o lojista só enxerga as faturas da própria loja.
  const { data: invoice } = await supabase.from("store_invoices").select(INVOICE_FIELDS).eq("id", id).eq("store_id", store.id).eq("status", "open").maybeSingle();
  if (!invoice) redirect("/painel/assinatura");
  if (!platformAccessToken()) redirect("/painel/assinatura?erro=indisponivel");

  const { data: contact } = await supabase.from("stores").select("email").eq("id", store.id).single();
  let url: string;
  try {
    url = await invoicePaymentUrl(invoice as InvoiceRow, contact?.email ?? null);
  } catch (err) {
    console.error("Link de pagamento da fatura falhou", { invoiceId: id, err });
    await notifyPlatformError("fatura:link", "Não foi possível gerar o link de pagamento de uma fatura", { fatura: id, loja: store.id, erro: String(err) });
    redirect("/painel/assinatura?erro=indisponivel");
  }
  redirect(url);
}
