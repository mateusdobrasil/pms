import { requireStore } from "@/lib/panel";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { supabase, store } = await requireStore();
  const { data } = await supabase
    .from("stores")
    .select("name, logo_url, primary_color, whatsapp, email, origin_zip")
    .eq("id", store.id)
    .single();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações da loja</h1>
      <SettingsForm storeId={store.id} settings={data!} />
    </div>
  );
}
