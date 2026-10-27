import Link from "next/link";
import { PlatformBrand } from "./painel/brand";
import { PLATFORM_CONTACT, platformWhatsappUrl } from "@/lib/platform";
import { PlatformWhatsappButton, WhatsappIcon } from "./whatsapp-button";
import { HowItWorks } from "./how-it-works";

// Para quem é: os dois tipos de negócio que a plataforma atende.
const AUDIENCES = [
  {
    title: "Lojas",
    examples: "Roupas, calçados, cosméticos, presentes, artesanato",
    points: ["Vitrine com fotos, tamanhos e cores", "Pix, cartão, frete e retirada", "Caixa para o balcão, com o mesmo estoque do site"],
  },
  {
    title: "Serviços com hora marcada",
    examples: "Salões, barbearias, estética, estúdios, consultórios",
    points: ["Agenda online com sinal no Pix ou cartão", "Lembrete e confirmação pelo WhatsApp", "Pacotes de sessões e comissão por profissional"],
  },
];

// Recursos, em grupos. Cada item: título curto e uma frase do que resolve para o lojista.
const GROUPS: { title: string; items: { title: string; text: string }[] }[] = [
  {
    title: "Vender",
    items: [
      { title: "Pix e cartão", text: "Mercado Pago com confirmação automática, parcelamento e desconto no Pix. O dinheiro cai direto na sua conta." },
      { title: "Checkout sem cadastro", text: "O cliente compra em poucos passos e acompanha o pedido por um link." },
      { title: "Frete e retirada", text: "Correios e transportadoras pelo Melhor Envio, entrega própria por bairro e retirada na loja." },
      { title: "Links de pagamento", text: "Cobre pelo WhatsApp ou Instagram o que foi combinado fora da loja, sem cadastrar produto." },
      { title: "Venda no balcão", text: "Caixa simples para a loja física: dinheiro com troco, Pix e maquininha, com o caixa do dia." },
      { title: "Cupons de desconto", text: "Percentual ou valor, com validade e limite, por código ou por um link que já aplica o desconto." },
    ],
  },
  {
    title: "Agenda",
    items: [
      { title: "Agendamento online", text: "O cliente escolhe serviço, profissional e horário livre, e paga o sinal ou o valor todo." },
      { title: "Remarcar e cancelar", text: "Pelo link do agendamento, dentro do prazo que você define, com estorno automático do sinal." },
      { title: "Lista de espera", text: "Dia lotado? O cliente entra na lista e é avisado quando abre um horário." },
      { title: "Pacotes de sessões", text: "Venda pacotes como \"5 escovas\": cada atendimento desconta uma sessão." },
      { title: "Comissão por profissional", text: "Percentual geral ou por serviço, com o fechamento do mês e planilha." },
    ],
  },
  {
    title: "Relacionamento",
    items: [
      { title: "WhatsApp oficial", text: "Confirmação de compra e de horário, lembrete da véspera e aviso de envio, pelo número oficial." },
      { title: "Campanhas no WhatsApp", text: "Novidades e promoções para quem aceitou receber, com saída da lista em um toque." },
      { title: "Cartão fidelidade", text: "A cada tantas compras ou atendimentos, um prêmio. Os carimbos são automáticos." },
      { title: "Cupom de aniversário", text: "No dia do aniversário, o cliente ganha um cupom só dele, por e-mail e WhatsApp." },
      { title: "Avaliações", text: "Depois da entrega ou do atendimento, o cliente avalia; a média aparece na loja e você responde." },
      { title: "Clientes que sumiram", text: "Veja quem não volta há tempos e chame no WhatsApp com a mensagem pronta." },
    ],
  },
  {
    title: "Divulgar",
    items: [
      { title: "Link para a bio", text: "Uma página com os botões da loja, seus links e produtos em destaque, para o Instagram." },
      { title: "QR Code para imprimir", text: "Cartaz para o balcão, etiquetas para sacolas e imagem para os stories." },
      { title: "Google e Instagram", text: "Produtos no Google Shopping e no catálogo do Instagram, com Pixel da Meta e Google Analytics." },
    ],
  },
  {
    title: "Gestão",
    items: [
      { title: "Painel no celular", text: "Instale como app e receba um aviso a cada venda e a cada agendamento." },
      { title: "Quanto você recebe", text: "Em cada venda, a taxa do Mercado Pago e o valor líquido. Planilha de pedidos para o contador." },
      { title: "Resumo do mês", text: "Todo dia 1, por e-mail: vendas, mais vendidos, agenda e clientes, comparados com o mês anterior." },
    ],
  },
  {
    title: "Tranquilidade",
    items: [
      { title: "Sua marca, seu endereço", text: "Logo e cores da loja, em sualoja.minhaloja.promo ou no domínio da sua marca." },
      { title: "Lei em dia", text: "Políticas de privacidade (LGPD) e de trocas (Código de Defesa do Consumidor) prontas." },
      { title: "Sem comissão sobre vendas", text: "Você paga só a mensalidade; as taxas de pagamento são as do Mercado Pago, na sua conta." },
    ],
  },
];

// O que experimentar na loja de demonstração.
const DEMO_STEPS = ["Ver os produtos e montar um carrinho", "Agendar um horário", "Ler as avaliações dos clientes", "Abrir o link da bio (/links)"];

export default function PlatformHome() {
  const demo = PLATFORM_CONTACT.demoStoreUrl;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <PlatformBrand />
          <div className="flex items-center gap-2">
            <a href="#recursos" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:inline">
              Recursos
            </a>
            <a href="#contato" className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              Contato
            </a>
            <Link
              href="/painel/login"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              Entrar no painel
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-primary-100 ring-1 ring-white/20">
              Para lojas e para quem atende com hora marcada
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Sua loja virtual e sua agenda online, prontas e com a <span className="text-accent-400">sua marca</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-primary-100">
              Venda com Pix e cartão, receba agendamentos com sinal e fale com os clientes pelo WhatsApp oficial. Nós montamos tudo; você cuida do
              seu negócio.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href={demo}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600"
              >
                Ver loja de demonstração
              </a>
              <a
                href={platformWhatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20"
              >
                <WhatsappIcon />
                Chamar no WhatsApp
              </a>
              <Link
                href="/painel/login"
                className="rounded-lg px-5 py-3 text-sm font-semibold text-primary-100 underline-offset-4 transition hover:text-white hover:underline"
              >
                Já sou lojista
              </Link>
            </div>
          </div>
        </section>

        <section className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Para quem é</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {AUDIENCES.map((a, i) => (
                <div key={a.title} className="rounded-2xl border bg-neutral-50 p-6">
                  <span className={`mb-4 block h-1.5 w-10 rounded-full ${i ? "bg-accent-400" : "bg-primary-500"}`} />
                  <h3 className="text-lg font-semibold">{a.title}</h3>
                  <p className="text-sm text-neutral-500">{a.examples}</p>
                  <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                    {a.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-neutral-600">Vende produtos e serviços? Os dois funcionam juntos na mesma loja.</p>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-20 border-b bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>
            <p className="mt-2 mb-8 max-w-2xl text-neutral-600">
              Da vitrine ao pacote na casa do cliente: veja o caminho de uma venda na sua loja.
            </p>
            <HowItWorks />
          </div>
        </section>

        <section id="recursos" className="scroll-mt-20 mx-auto max-w-6xl space-y-12 px-4 py-16 sm:py-20">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Tudo o que o seu negócio precisa</h2>
            <p className="mt-2 max-w-2xl text-neutral-600">Uma plataforma só para vender, agendar e trazer o cliente de volta.</p>
          </div>
          {GROUPS.map((g, gi) => (
            <div key={g.title}>
              <h3 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-primary-700">
                <span className={`h-1.5 w-8 rounded-full ${gi % 2 ? "bg-accent-400" : "bg-accent-500"}`} />
                {g.title}
              </h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((f) => (
                  <li key={f.title} className="rounded-xl border bg-white p-5 shadow-sm">
                    <h4 className="font-semibold">{f.title}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{f.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="border-y bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:py-20 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Veja funcionando</h2>
              <p className="mt-3 text-neutral-600">
                Abra a nossa loja de demonstração no celular ou no computador e navegue como um cliente. É a mesma loja que você recebe, com a sua marca.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-neutral-700">
                {DEMO_STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-primary-700 to-primary-500 p-8 text-white shadow-lg md:ml-auto md:max-w-sm">
              <p className="text-sm font-medium text-primary-100">Loja de demonstração</p>
              <p className="mt-1 break-all text-lg font-semibold">{demo.replace(/^https?:\/\//, "")}</p>
              <a
                href={demo}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-block rounded-lg bg-white px-5 py-3 text-sm font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50"
              >
                Abrir a loja
              </a>
              <p className="mt-4 text-xs text-primary-100">Quer ver o painel do lojista? Mostramos numa conversa rápida pelo WhatsApp.</p>
            </div>
          </div>
        </section>

        <section id="contato" className="scroll-mt-20 bg-primary-50">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:py-20 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Quer uma loja ou uma agenda online para o seu negócio?</h2>
              <p className="mt-3 text-neutral-600">
                Fale com a gente pelo WhatsApp ou por e-mail: tiramos suas dúvidas, mostramos o painel e montamos tudo com a sua marca.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:ml-auto md:w-fit">
              <a
                href={platformWhatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              >
                <WhatsappIcon />
                Chamar no WhatsApp
              </a>
              <a
                href={`tel:${PLATFORM_CONTACT.phoneTel}`}
                className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-white px-5 py-3 text-sm font-semibold text-primary-700 shadow-sm transition hover:border-primary-300"
              >
                Ligar: {PLATFORM_CONTACT.phoneDisplay}
              </a>
              <a
                href={`mailto:${PLATFORM_CONTACT.email}`}
                className="inline-flex items-center justify-center rounded-lg sm:col-span-2 border border-primary-200 bg-white px-5 py-3 text-sm font-semibold text-primary-700 shadow-sm transition hover:border-primary-300"
              >
                {PLATFORM_CONTACT.email}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-neutral-500">
          <span>PMS app</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href={platformWhatsappUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900">
              WhatsApp {PLATFORM_CONTACT.phoneDisplay}
            </a>
            <a href={`mailto:${PLATFORM_CONTACT.email}`} className="hover:text-neutral-900">
              {PLATFORM_CONTACT.email}
            </a>
            <a href={demo} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900">Loja de demonstração</a>
            <Link href="/termos" className="hover:text-neutral-900">Termos de uso</Link>
            <Link href="/painel/login" className="hover:text-neutral-900">Acesso do lojista</Link>
            <a href={PLATFORM_CONTACT.webmailUrl} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900">
              Webmail
            </a>
          </div>
        </div>
      </footer>
      <PlatformWhatsappButton />
    </div>
  );
}
