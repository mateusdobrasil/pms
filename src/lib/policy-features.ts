import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { PolicyFeatures } from "@/lib/policies";

// O que a loja usa, para a política de privacidade falar só do que se aplica. Cada coluna é lida à parte: sem o SQL
// de um recurso, ele simplesmente não entra na política.
export const getPolicyFeatures = cache(async (storeId: string): Promise<PolicyFeatures> => {
  const db = createPublicClient();
  const col = async <T>(column: string) => {
    const { data, error } = await db.from("stores").select(column).eq("id", storeId).maybeSingle();
    return error || !data ? null : ((data as unknown as Record<string, T>)[column] ?? null);
  };
  const [booking, whatsapp, quota, birthday, abandonedCart] = await Promise.all([
    col<boolean>("booking_enabled"),
    col<boolean>("whatsapp_reminders"),
    col<number>("whatsapp_campaign_quota"),
    col<boolean>("birthday_enabled"),
    col<boolean>("abandoned_cart_enabled"),
  ]);
  return { booking: !!booking, whatsapp: !!whatsapp, campaigns: !!whatsapp && (quota ?? 0) > 0, birthday: !!birthday, abandonedCart: !!abandonedCart };
});
