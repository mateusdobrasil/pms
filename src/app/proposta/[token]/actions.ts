"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { TERMS_VERSION } from "@/lib/terms";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { platformUrl } from "@/lib/urls";
import { todayBR } from "@/lib/billing";
import { notifyProposalAccepted } from "@/lib/email";
import { PROPOSAL_FIELDS, type Proposal } from "@/lib/proposals";

// O cliente aceita a proposta e os Termos de uso (só uma vez e só dentro da validade).
// Guarda a versão dos termos e a prova do aceite (IP e navegador). A plataforma recebe um e-mail.
export async function acceptProposal(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!isUuid(token)) redirect("/");
  if (form.get("terms") !== "on") redirect(`/proposta/${token}?termos=1`);
  const h = await headers();
  const proof = {
    terms_version: TERMS_VERSION,
    accepted_ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    accepted_user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
  const db = createAdminClient();
  const accept = (extra: object) =>
    db
      .from("proposals")
      .update({ accepted_at: new Date().toISOString(), ...extra })
      .eq("public_token", token)
      .is("accepted_at", null)
      .gte("valid_until", todayBR())
      .select(PROPOSAL_FIELDS);
  const first = await accept(proof);
  // Antes do SQL 20261028000000 as colunas da prova não existem: aceita sem elas (e avisa no log).
  if (first.error) console.error("Aceite sem a prova dos termos", first.error.message);
  const { data } = first.error ? await accept({}) : first;
  const p = data?.[0] as Proposal | undefined;
  if (p) after(() => notifyProposalAccepted(p, platformUrl(`/admin/propostas/${p.id}`)));
  redirect(`/proposta/${token}`);
}
