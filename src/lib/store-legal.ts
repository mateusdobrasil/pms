import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type StoreLegal = {
  legalName: string | null; // nome empresarial (razão social) ou nome do responsável
  document: string | null; // CPF ou CNPJ, só dígitos
  address: string | null;
  privacyPolicy: string | null; // texto próprio; nulo = modelo padrão
  returnsPolicy: string | null;
  about: string | null; // "Quem somos" (vazio = só o nome da loja)
};

const NONE: StoreLegal = { legalName: null, document: null, address: null, privacyPolicy: null, returnsPolicy: null, about: null };

// Dados legais da loja. Consulta separada de getStoreByDomain: sem as colunas
// (SQL 20261023100000 não rodado), a vitrine segue sem eles em vez de quebrar.
export const getStoreLegal = cache(async (storeId: string): Promise<StoreLegal> => {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("legal_name, document, address, privacy_policy, returns_policy")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return NONE;
  // "Quem somos": coluna mais nova (SQL 20261031000000), lida à parte.
  const { data: extra } = await createPublicClient().from("stores").select("about").eq("id", storeId).maybeSingle();
  return {
    about: (extra as { about: string | null } | null)?.about ?? null,
    legalName: data.legal_name,
    document: data.document,
    address: data.address,
    privacyPolicy: data.privacy_policy,
    returnsPolicy: data.returns_policy,
  };
});
