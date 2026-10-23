import { requireStore } from "@/lib/panel";
import { SettingsForm } from "./settings-form";
import { storeBaseUrl } from "@/lib/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SHIPPING_MODE, parseShippingMode } from "@/lib/shipping-mode";

export default async function SettingsPage() {
  const { supabase, store } = await requireStore();
  const { data } = await supabase
    .from("stores")
    .select("name, logo_url, primary_color, whatsapp, email, origin_zip")
    .eq("id", store.id)
    .single();
  // Consulta à parte: sem o SQL do banner rodado, a página continua funcionando, só sem essa seção.
  const { data: banner, error: bannerError } = await supabase
    .from("stores")
    .select("banner_image_url, banner_title, banner_subtitle, banner_link")
    .eq("id", store.id)
    .single();
  // Promoções: também à parte (SQL 20261022200000).
  const { data: promos, error: promosError } = await supabase
    .from("stores")
    .select("pix_discount_percent, free_shipping_min_cents")
    .eq("id", store.id)
    .single();
  // Instagram e rastreamento: também à parte (SQL 20261023000000).
  const { data: marketing, error: marketingError } = await supabase
    .from("stores")
    .select("instagram, meta_pixel_id, ga_measurement_id")
    .eq("id", store.id)
    .single();
  // Código de verificação do Google: também à parte (SQL 20261023200000).
  const { data: gsv, error: gsvError } = await supabase.from("stores").select("google_site_verification").eq("id", store.id).single();

  // Dados legais e políticas: também à parte (SQL 20261023100000).
  const { data: legal, error: legalError } = await supabase
    .from("stores")
    .select("legal_name, document, address, privacy_policy, returns_policy")
    .eq("id", store.id)
    .single();
  // Agendamentos: também à parte (SQL 20261101000000).
  const { data: booking, error: bookingError } = await supabase
    .from("stores")
    .select("booking_enabled, booking_slot_minutes, booking_min_notice_minutes, booking_max_days, booking_cancel_hours")
    .eq("id", store.id)
    .single();
  // Forma de entrega: também à parte (SQL 20261102000000).
  const { data: shippingRow, error: shippingError } = await supabase.from("stores").select("shipping_mode").eq("id", store.id).single();
  // O token do Melhor Envio fica em store_secrets (só service role): aqui só se ele existe, para avisar o lojista.
  const { data: secret } = await createAdminClient()
    .from("store_secrets")
    .select("melhor_envio_token")
    .eq("store_id", store.id)
    .maybeSingle();
  // "Quem somos": também à parte (SQL 20261031000000).
  const { data: aboutRow, error: aboutError } = await supabase.from("stores").select("about").eq("id", store.id).single();
  const { data: domains } = await supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id);
  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
  // Base do modelo das políticas; nome, CNPJ e endereço vêm dos campos na hora de "Partir do modelo".
  const policyBase = {
    name: data!.name,
    email: data!.email,
    whatsapp: data!.whatsapp,
    hasAnalytics: !!(marketing?.meta_pixel_id || marketing?.ga_measurement_id),
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações da loja</h1>
      <SettingsForm storeId={store.id} settings={data!} banner={bannerError ? null : banner} promos={promosError ? null : promos} marketing={marketingError ? null : marketing}
        legal={legalError ? null : legal}
        about={aboutError ? undefined : (aboutRow?.about ?? null)}
        booking={bookingError ? null : booking}
        shipping={
          shippingError
            ? null
            : { mode: parseShippingMode(shippingRow?.shipping_mode) ?? DEFAULT_SHIPPING_MODE, melhorEnvioReady: !!secret?.melhor_envio_token }
        }
        policyBase={policyBase}
        storeUrl={domain ? storeBaseUrl(domain) : null}
        googleVerification={gsvError ? undefined : (gsv?.google_site_verification ?? null)}
      />
    </div>
  );
}
