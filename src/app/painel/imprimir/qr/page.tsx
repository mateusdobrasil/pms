import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { qrSvg, resolveQrTarget } from "@/lib/qr";
import { PrintButton } from "../[id]/print-button";

export const metadata = { title: "Imprimir QR Code", robots: { index: false } };

const LABELS = 8; // etiquetas por folha A4 (2 × 4)

// Cartaz A4 (balcão, vitrine) ou folha de etiquetas (sacola, embalagem) com o QR Code da loja, da agenda ou de um link.
export default async function PrintQrPage({ searchParams }: { searchParams: Promise<{ alvo?: string; id?: string; formato?: string }> }) {
  const { alvo, id, formato } = await searchParams;
  const { supabase, store } = await requireStore();
  const target = await resolveQrTarget(supabase, store.id, alvo, id);
  if (!target) notFound();
  const { data: brand } = await supabase.from("stores").select("primary_color").eq("id", store.id).single();
  const color = /^#[0-9a-f]{3,8}$/i.test(brand?.primary_color ?? "") ? brand!.primary_color : "#171717";
  const svg = await qrSvg(target.url);
  const labels = formato === "etiquetas";
  const shortUrl = target.url.replace(/^https?:\/\//, "");
  const qs = (f: string) => `/painel/imprimir/qr?alvo=${target.kind}${id ? `&id=${id}` : ""}&formato=${f}`;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <div className="flex gap-1 rounded-md border bg-white p-1 text-sm">
          <Link href={qs("cartaz")} className={`rounded px-3 py-1.5 ${labels ? "hover:bg-neutral-50" : "bg-neutral-900 text-white"}`}>Cartaz A4</Link>
          <Link href={qs("etiquetas")} className={`rounded px-3 py-1.5 ${labels ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>Etiquetas (8 por folha)</Link>
        </div>
        <PrintButton />
      </div>

      {labels ? (
        <article className="mx-auto grid max-w-[210mm] grid-cols-2 gap-[6mm] bg-white p-[10mm] text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
          {Array.from({ length: LABELS }, (_, i) => (
            <div key={i} className="flex h-[64mm] items-center gap-[4mm] rounded-[3mm] border border-dashed border-neutral-400 p-[4mm]">
              <div className="h-[48mm] w-[48mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 space-y-[2mm]">
                <p className="text-[11pt] font-bold leading-tight" style={{ color }}>{store.name}</p>
                <p className="text-[10pt] font-semibold leading-tight">{target.title}</p>
                <p className="break-all text-[7pt] text-neutral-600">{shortUrl}</p>
              </div>
            </div>
          ))}
        </article>
      ) : (
        <article className="mx-auto flex min-h-[297mm] max-w-[210mm] flex-col items-center justify-evenly bg-white px-[18mm] py-[20mm] text-center text-black shadow-sm print:h-[272mm] print:min-h-0 print:max-w-none print:break-inside-avoid print:overflow-hidden print:p-0 print:shadow-none">
          <header className="space-y-[4mm]">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={store.name} className="mx-auto max-h-[28mm] w-auto" />
            ) : (
              <p className="text-[26pt] font-bold" style={{ color }}>{store.name}</p>
            )}
            <h1 className="text-[34pt] font-extrabold leading-tight">{target.title}</h1>
          </header>
          <div className="rounded-[6mm] border-[2.5mm] p-[8mm]" style={{ borderColor: color }}>
            <div className="h-[110mm] w-[110mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <footer className="space-y-[3mm]">
            <p className="text-[16pt] text-neutral-700">{target.subtitle}</p>
            <p className="text-[13pt] font-semibold">{shortUrl}</p>
          </footer>
        </article>
      )}
    </div>
  );
}
