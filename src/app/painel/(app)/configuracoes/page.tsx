import { requireStore } from "@/lib/panel";
import { SettingsForm } from "./settings-form";

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

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações da loja</h1>
      <SettingsForm storeId={store.id} settings={data!} banner={bannerError ? null : banner} promos={promosError ? null : promos} />
    </div>
  );
}
