import Link from "next/link";
import { PlatformBrand } from "./painel/brand";

const FEATURES = [
  { title: "Pix e cartão", text: "Pagamento pelo Mercado Pago, com confirmação automática e o dinheiro direto na sua conta." },
  { title: "Catálogo completo", text: "Produtos com fotos, tamanhos e cores, estoque por variação e categorias." },
  { title: "Checkout sem cadastro", text: "O cliente compra em poucos passos e acompanha o pedido por um link." },
  { title: "Painel simples", text: "Pedidos, rastreio, produtos e o resumo de vendas do dia e do mês." },
  { title: "Seu domínio", text: "A loja no endereço da sua marca, com as suas cores e logo." },
  { title: "WhatsApp", text: "Botão de atendimento em todas as páginas da loja." },
];

export default function PlatformHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <PlatformBrand />
          <Link
            href="/painel/login"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            Entrar no painel
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-primary-100 ring-1 ring-white/20">
              Lojas virtuais para pequenos lojistas
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Sua loja virtual pronta, vendendo com Pix e cartão.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-primary-100">
              Nós montamos a loja com a sua marca. Você cadastra os produtos, acompanha os pedidos e recebe direto no
              Mercado Pago.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/painel/login"
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-primary-800 shadow-sm transition hover:bg-primary-50"
              >
                Já sou lojista — entrar
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Tudo o que a sua loja precisa</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border bg-white p-6 shadow-sm">
                <span className="mb-4 block h-1.5 w-10 rounded-full bg-primary-500" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-neutral-500">
          <span>PMS app</span>
          <Link href="/painel/login" className="hover:text-neutral-900">Acesso do lojista</Link>
        </div>
      </footer>
    </div>
  );
}
