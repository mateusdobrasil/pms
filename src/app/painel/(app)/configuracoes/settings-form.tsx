"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { productImageUrl } from "@/lib/images";
import { MAX_ORIGINAL_BYTES, compressImage } from "@/lib/compress-image";
import { saveSettings, type SettingsState } from "./actions";

type Settings = {
  name: string;
  logo_url: string | null;
  primary_color: string;
  whatsapp: string | null;
  email: string | null;
  origin_zip: string | null;
};

type BannerSettings = {
  banner_image_url: string | null;
  banner_title: string | null;
  banner_subtitle: string | null;
  banner_link: string | null;
} | null;

const input = "w-full rounded-lg border px-3 py-2 text-sm";
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function SettingsForm({
  storeId,
  settings,
  banner,
}: {
  storeId: string;
  settings: Settings;
  banner: BannerSettings;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, null);
  const [color, setColor] = useState(settings.primary_color);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState(banner?.banner_image_url ?? "");
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Envia a imagem para o Storage da loja e devolve a mensagem de erro, se houver.
  // A URL nova só vale depois de "Salvar".
  async function upload(original: File | undefined, kind: "logo" | "banner", maxMB: number) {
    if (!original) return null;
    if (!LOGO_TYPES[original.type]) return "Use PNG, JPG ou WebP.";
    if (original.size > MAX_ORIGINAL_BYTES) return "Arquivo muito grande (máximo de 25 MB).";
    // Reduz no navegador antes de enviar (WebP mantém a transparência do logo).
    const file = await compressImage(original, kind === "logo" ? 600 : 2000);
    const ext = LOGO_TYPES[file.type];
    if (file.size > maxMB * 1024 * 1024) return `Não foi possível reduzir para menos de ${maxMB} MB.`;
    setUploading(true);
    const path = `${storeId}/branding/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error } = await createSupabaseBrowserClient()
      .storage.from("product-images")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setUploading(false);
    if (error) return "Falha no envio da imagem.";
    (kind === "logo" ? setLogoUrl : setBannerUrl)(productImageUrl(path));
    return null;
  }

  async function uploadLogo(file: File | undefined) {
    setLogoError(null);
    setLogoError(await upload(file, "logo", 2));
  }

  async function uploadBanner(file: File | undefined) {
    setBannerError(null);
    setBannerError(await upload(file, "banner", 5));
  }

  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Identidade</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Nome da loja</span>
          <input name="name" required defaultValue={settings.name} className={input} />
        </label>

        <div className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Cor principal</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border bg-white p-1"
              aria-label="Escolher cor"
            />
            <input name="primary_color" value={color} onChange={(e) => setColor(e.target.value)} className="w-32 rounded-lg border px-3 py-2 font-mono text-sm" />
            <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: color }}>
              Prévia do botão
            </span>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <span className="font-medium text-neutral-700">Logo</span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-32 place-items-center overflow-hidden rounded-lg border bg-neutral-50">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="max-h-14 max-w-28 object-contain" />
              ) : (
                <span className="text-xs text-neutral-400">sem logo</span>
              )}
            </div>
            <input type="hidden" name="logo_url" value={logoUrl} />
            <label className={`cursor-pointer rounded-lg border px-3 py-2 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              {uploading ? "Enviando…" : "Enviar logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {logoUrl && (
              <button type="button" onClick={() => setLogoUrl("")} className="text-red-700 underline">
                Remover
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-500">PNG com fundo transparente fica melhor. A imagem é reduzida automaticamente. Sem logo, a loja mostra a inicial do nome.</p>
          {logoError && <p className="text-red-700">{logoError}</p>}
        </div>
      </section>

      {banner && (
        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">Banner da página inicial</h2>
            <p className="text-xs text-neutral-500">
              Aparece no topo da loja. Sem imagem e sem título, a loja mostra a saudação padrão com a sua cor.
            </p>
          </div>
          <input type="hidden" name="banner_enabled" value="1" />
          <input type="hidden" name="banner_image_url" value={bannerUrl} />
          <div className="space-y-2 text-sm">
            <span className="font-medium text-neutral-700">Imagem</span>
            <div className="aspect-[3/1] w-full overflow-hidden rounded-lg border bg-neutral-50">
              {bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-xs text-neutral-400">sem imagem</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className={`cursor-pointer rounded-lg border px-3 py-2 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                {uploading ? "Enviando…" : "Enviar imagem"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
              </label>
              {bannerUrl && (
                <button type="button" onClick={() => setBannerUrl("")} className="text-red-700 underline">
                  Remover
                </button>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              Formato largo, 1800 × 600 pixels (3 por 1). No celular, as laterais são cortadas: deixe o principal no centro. Evite texto escrito na imagem: use os campos abaixo, que ficam legíveis em qualquer tela. A imagem é reduzida automaticamente.
            </p>
            {bannerError && <p className="text-red-700">{bannerError}</p>}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Título (opcional)</span>
            <input name="banner_title" maxLength={80} defaultValue={banner.banner_title ?? ""} placeholder="Ex.: Coleção de verão" className={input} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Texto (opcional)</span>
            <input name="banner_subtitle" maxLength={160} defaultValue={banner.banner_subtitle ?? ""} placeholder="Ex.: Até 30% de desconto na linha de tratamento" className={input} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-neutral-700">Link ao clicar (opcional)</span>
            <input name="banner_link" defaultValue={banner.banner_link ?? ""} placeholder="/c/promocoes" className={input} />
            <span className="text-xs text-neutral-500">
              Uma página da loja, como /c/nome-da-categoria ou /p/nome-do-produto, ou um endereço começando com https://.
            </span>
          </label>
        </section>
      )}

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Contato e envio</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">WhatsApp (DDD + número)</span>
          <input
            name="whatsapp"
            defaultValue={settings.whatsapp?.replace(/^55/, "") ?? ""}
            inputMode="numeric"
            placeholder="11999999999"
            className={input}
          />
          <span className="text-xs text-neutral-500">Aparece no botão de WhatsApp da loja. Deixe vazio para esconder.</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">E-mail da loja</span>
          <input name="email" type="email" defaultValue={settings.email ?? ""} className={input} />
          <span className="text-xs text-neutral-500">Recebe o aviso de cada venda e as respostas dos clientes aos e-mails do pedido.</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">CEP de origem</span>
          <input name="origin_zip" defaultValue={settings.origin_zip ?? ""} inputMode="numeric" placeholder="00000-000" className={input} />
          <span className="text-xs text-neutral-500">De onde os pedidos saem. Usado para calcular o frete.</span>
        </label>
      </section>

      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}

      <button
        type="submit"
        disabled={pending || uploading}
        className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
