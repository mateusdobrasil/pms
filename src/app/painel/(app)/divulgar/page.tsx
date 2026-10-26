import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { qrSvg, storeQrTargets } from "@/lib/qr";

export const metadata = { title: "Divulgar · PMS app" };

const button = "rounded-md border px-3 py-2 text-sm font-medium transition hover:border-neutral-400";

// QR Codes da loja para o mundo físico: cartaz, etiquetas e imagem para baixar.
export default async function PromotePage() {
  const { supabase, store } = await requireStore();
  const targets = await storeQrTargets(supabase, store.id);
  const svgs = await Promise.all(targets.map((t) => qrSvg(t.url)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Divulgar</h1>
        <p className="mt-1 text-sm text-neutral-600">
          QR Codes da sua loja para o balcão, a vitrine, as sacolas e o cartão de visita. O cliente aponta a câmera do celular e cai direto na
          loja{targets.some((t) => t.kind === "agendar") ? " ou na agenda" : ""}.
        </p>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">A loja ainda não tem endereço. Fale com o suporte.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {targets.map((t, i) => (
            <section key={t.kind} className="flex gap-4 rounded-xl border bg-white p-5 shadow-sm">
              <div className="h-32 w-32 shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[i] }} />
              <div className="min-w-0 space-y-2">
                <h2 className="font-medium">{t.title}</h2>
                <p className="break-all text-xs text-neutral-500">{t.url.replace(/^https?:\/\//, "")}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/painel/imprimir/qr?alvo=${t.kind}&formato=cartaz`} target="_blank" className={button}>Imprimir cartaz</Link>
                  <Link href={`/painel/imprimir/qr?alvo=${t.kind}&formato=etiquetas`} target="_blank" className={button}>Imprimir etiquetas</Link>
                  <a href={`/painel/qr?alvo=${t.kind}`} download className={button}>Baixar imagem</a>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="rounded-xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
        <h2 className="font-medium text-neutral-900">Onde usar</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Cartaz A4</strong>: no balcão, no caixa, na vitrine ou na porta (&quot;Compre também pelo celular&quot;).</li>
          <li><strong>Etiquetas</strong>: 8 por folha, para recortar e colar em sacolas, embalagens e no cartão de visita. Dá para imprimir em papel adesivo.</li>
          <li><strong>Imagem</strong>: para postar nos stories, mandar no WhatsApp ou levar para a gráfica.</li>
          <li>Cada <Link href="/painel/links" className="font-medium text-primary-700 hover:underline">link de pagamento</Link> também tem o seu QR Code, para o cliente pagar na hora, no balcão.</li>
        </ul>
      </section>
    </div>
  );
}
