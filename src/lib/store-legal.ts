import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type StoreLegal = {
  legalName: string | null; // nome empresarial (razão social) ou nome do responsável
  document: string | null; // CPF ou CNPJ, só dígitos
  address: string | null;
  privacyPolicy: string | null; // texto próprio; nulo = modelo padrão
  returnsPolicy: string | null;
};

const NONE: StoreLegal = { legalName: null, document: null, address: null, privacyPolicy: null, returnsPolicy: null };

// Dados legais da loja. Consulta separada de getStoreByDomain: sem as colunas
// (SQL 20261023100000 não rodado), a vitrine segue sem eles em vez de quebrar.
export const getStoreLegal = cache(async (storeId: string): Promise<StoreLegal> => {
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("legal_name, document, address, privacy_policy, returns_policy")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return NONE;
  return {
    legalName: data.legal_name,
    document: data.document,
    address: data.address,
    privacyPolicy: data.privacy_policy,
    returnsPolicy: data.returns_policy,
  };
});
