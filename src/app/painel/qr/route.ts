import { requireStore } from "@/lib/panel";
import { qrPng, resolveQrTarget } from "@/lib/qr";

// Baixar o QR Code em PNG (1200 px): /painel/qr?alvo=loja | agendar | link&id=<token>.
export async function GET(req: Request) {
  const { supabase, store } = await requireStore();
  const sp = new URL(req.url).searchParams;
  const target = await resolveQrTarget(supabase, store.id, sp.get("alvo") ?? undefined, sp.get("id") ?? undefined);
  if (!target) return new Response("QR Code indisponível", { status: 404 });
  const png = await qrPng(target.url);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${target.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
