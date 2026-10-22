"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { parseBRL } from "@/lib/money";
import { isEmail, isUuid, onlyDigits } from "@/lib/validation";
import { platformUrl } from "@/lib/urls";
import { sendProposalEmail } from "@/lib/email";
import { PROPOSAL_FIELDS, type Proposal, proposalWhatsappText } from "@/lib/proposals";

export type ProposalState = { error?: string; ok?: string } | null;

const MAX_FEE_CENTS = 10_000_000; // R$ 100.000,00: trava contra erro de digitação

const publicUrl = (token: string) => platformUrl(`/proposta/${token}`);

function refresh(id?: string) {
  revalidatePath("/admin/propostas");
  if (id) revalidatePath(`/admin/propostas/${id}`);
}

export async function saveProposal(_prev: ProposalState, form: FormData): Promise<ProposalState> {
  const { db } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const fee = (name: string) => (text(name) ? parseBRL(text(name)) : 0);

  const clientName = text("client_name").replace(/\s+/g, " ");
  const businessName = text("business_name").replace(/\s+/g, " ");
  const email = text("email").toLowerCase();
  const whatsapp = onlyDigits(text("whatsapp")).replace(/^55(?=\d{10,11}$)/, "");
  const setup = fee("setup_fee");
  const monthly = fee("monthly_fee");
  const validUntil = text("valid_until");

  if (clientName.length < 2 || clientName.length > 120) return { error: "Informe o nome do contato." };
  if (businessName.length < 2 || businessName.length > 120) return { error: "Informe o nome do negócio." };
  if (email && !isEmail(email)) return { error: "E-mail inválido." };
  if (whatsapp && !/^\d{10,11}$/.test(whatsapp)) return { error: "WhatsApp inválido: use DDD + número (ex.: 11 98888-7777)." };
  if (setup === null || setup > MAX_FEE_CENTS) return { error: "Valor da implantação inválido (ex.: 2.000,00)." };
  if (monthly === null || monthly > MAX_FEE_CENTS) return { error: "Valor da mensalidade inválido (ex.: 300,00)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return { error: "Informe a validade da proposta." };
  if (text("items").length > 5000 || text("notes").length > 5000) return { error: "Texto muito longo (até 5.000 caracteres)." };

  const row = {
    client_name: clientName,
    business_name: businessName,
    email: email || null,
    whatsapp: whatsapp || null,
    setup_fee_cents: setup,
    monthly_fee_cents: monthly,
    valid_until: validUntil,
    items: text("items"),
    notes: text("notes") || null,
    updated_at: new Date().toISOString(),
  };

  if (isUuid(id)) {
    const { error } = await db.from("proposals").update(row).eq("id", id);
    if (error) return { error: "Não foi possível salvar a proposta." };
    refresh(id);
    return { ok: "Proposta salva." };
  }
  const { data, error } = await db.from("proposals").insert(row).select("id").single();
  if (error) return { error: "Não foi possível criar a proposta. O SQL das propostas (20261026000000) já foi rodado?" };
  refresh();
  redirect(`/admin/propostas/${data.id}?criada=1`);
}

async function loadProposal(id: string) {
  const { db } = await requireAdmin();
  if (!isUuid(id)) return { db, proposal: null };
  const { data } = await db.from("proposals").select(PROPOSAL_FIELDS).eq("id", id).maybeSingle();
  return { db, proposal: data as Proposal | null };
}

export async function emailProposal(_prev: ProposalState, form: FormData): Promise<ProposalState> {
  const id = String(form.get("id") ?? "");
  const { db, proposal } = await loadProposal(id);
  if (!proposal) return { error: "Proposta não encontrada." };
  const error = await sendProposalEmail(proposal, publicUrl(proposal.public_token));
  if (error) return { error: `E-mail não enviado: ${error}` };
  await db.from("proposals").update({ sent_at: new Date().toISOString() }).eq("id", id);
  refresh(id);
  return { ok: `Proposta enviada para ${proposal.email}.` };
}

// Marca como enviada e abre a conversa no WhatsApp com a mensagem pronta.
export async function whatsappProposal(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { db, proposal } = await loadProposal(id);
  if (!proposal?.whatsapp) redirect(`/admin/propostas/${id}`);
  await db.from("proposals").update({ sent_at: new Date().toISOString() }).eq("id", id);
  refresh(id);
  const message = proposalWhatsappText(proposal, publicUrl(proposal.public_token));
  redirect(`https://wa.me/55${proposal.whatsapp}?text=${encodeURIComponent(message)}`);
}

export async function deleteProposal(form: FormData) {
  const { db } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (isUuid(id)) await db.from("proposals").delete().eq("id", id);
  refresh();
  redirect("/admin/propostas");
}
