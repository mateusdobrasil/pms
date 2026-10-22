"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { platformUrl } from "@/lib/urls";
import { todayBR } from "@/lib/billing";
import { notifyProposalAccepted } from "@/lib/email";
import { PROPOSAL_FIELDS, type Proposal } from "@/lib/proposals";

// O cliente aceita a proposta (só uma vez e só dentro da validade). A plataforma recebe um e-mail.
export async function acceptProposal(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!isUuid(token)) redirect("/");
  const db = createAdminClient();
  const { data } = await db
    .from("proposals")
    .update({ accepted_at: new Date().toISOString() })
    .eq("public_token", token)
    .is("accepted_at", null)
    .gte("valid_until", todayBR())
    .select(PROPOSAL_FIELDS);
  const p = data?.[0] as Proposal | undefined;
  if (p) after(() => notifyProposalAccepted(p, platformUrl(`/admin/propostas/${p.id}`)));
  redirect(`/proposta/${token}`);
}
