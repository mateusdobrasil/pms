import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getShippingSettings } from "@/lib/shipping";
import { type SetupState, setupProgress, setupSteps } from "@/lib/setup";

// Estado da loja para os primeiros passos (service role: as credenciais ficam em store_secrets). Cada coluna de
// recurso opcional é lida à parte: sem o SQL dela, o passo só fica como não feito.
export async function loadSetupState(db: SupabaseClient, storeId: string): Promise<SetupState> {
  const col = async <T>(column: string) => {
    const { data, error } = await db.from("stores").select(column).eq("id", storeId).maybeSingle();
    return error || !data ? null : ((data as unknown as Record<string, T>)[column] ?? null);
  };
  const count = async (table: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base(table);
    const { count: n } = await (extra ? extra(q) : q);
    return n ?? 0;
  };
  const base = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId);

  const [store, legalName, document, address, bookingEnabled, instagram, bioText, shipping, secret] = await Promise.all([
    db.from("stores").select("logo_url, email, whatsapp, origin_zip").eq("id", storeId).single().then((r) => r.data),
    col<string>("legal_name"),
    col<string>("document"),
    col<string>("address"),
    col<boolean>("booking_enabled"),
    col<string>("instagram"),
    col<string>("bio_text"),
    getShippingSettings(storeId),
    db.from("store_secrets").select("gateway_access_token, melhor_envio_token").eq("store_id", storeId).maybeSingle().then((r) => r.data),
  ]);
  const [products, services, professionals, paidOrders, paidBookings, pushDevices] = await Promise.all([
    count("products", (q) => q.eq("active", true)),
    count("services", (q) => q.eq("active", true)),
    db.from("working_hours").select("professional_id").eq("store_id", storeId).then((r) => new Set((r.data ?? []).map((w) => w.professional_id)).size),
    count("orders", (q) => q.not("paid_at", "is", null)),
    count("bookings", (q) => q.gt("paid_cents", 0)),
    count("push_subscriptions"),
  ]);
  const token = (secret?.gateway_access_token as string | null) ?? null;
  return {
    hasLogo: !!store?.logo_url,
    hasEmail: !!store?.email,
    hasWhatsapp: !!store?.whatsapp,
    hasLegal: !!(legalName && document && address),
    products,
    bookingEnabled: !!bookingEnabled,
    services,
    bookableProfessionals: professionals,
    hasOriginZip: !!store?.origin_zip,
    hasShippingOption: shipping.pickup || shipping.localDelivery || (shipping.carriers !== "none" && !!secret?.melhor_envio_token),
    paymentConfigured: !!token,
    paymentLive: !!token && token.startsWith("APP_USR-"),
    testSale: paidOrders + paidBookings > 0,
    pushDevices,
    hasInstagramOrBio: !!(instagram || bioText),
  };
}

export async function loadSetup(db: SupabaseClient, storeId: string) {
  const steps = setupSteps(await loadSetupState(db, storeId));
  return { steps, progress: setupProgress(steps) };
}
