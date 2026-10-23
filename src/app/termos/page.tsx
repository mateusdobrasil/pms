import type { ReactNode } from "react";
import Link from "next/link";
import { PLATFORM_CONTACT } from "@/lib/platform";
import { PLATFORM_LEGAL, TERMS_UPDATED, TERMS_VERSION } from "@/lib/terms";
import { BILLING } from "@/lib/billing";

export const metadata = {
  title: "Termos de uso · PMS app",
  description: "Condições de contratação da loja virtual PMS app: implantação, mensalidade, cancelamento, responsabilidades e dados pessoais.",
};

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 print:break-inside-avoid">
      <h2 className="text-lg font-semibold">
        {n}. {title}
      </h2>
      <div className="space-y-2 text-neutral-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  // CNPJ e endereço só aparecem quando preenchidos em src/lib/terms.ts.
  const legal = [PLATFORM_LEGAL.document && `CNPJ ${PLATFORM_LEGAL.document}`, PLATFORM_LEGAL.address].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <article className="mx-auto max-w-3xl space-y-8 rounded-2xl bg-white px-6 py-8 text-sm leading-relaxed shadow-sm ring-1 ring-neutral-200 sm:px-10 sm:text-base print:shadow-none print:ring-0">
        <header className="space-y-1 border-b pb-6">
          <Link href="/" className="text-sm font-semibold text-primary-700">PMS app</Link>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Termos de uso da plataforma</h1>
          <p className="text-neutral-500">
            Versão {TERMS_VERSION} · atualizados em {TERMS_UPDATED}
          </p>
          <p className="pt-2 text-neutral-700">
            Estes termos valem entre a {PLATFORM_LEGAL.name}
            {legal && ` (${legal})`} e o lojista que contrata uma loja virtual (&quot;lojista&quot;). Eles são aceitos
            ao aceitar a proposta comercial e complementam o que foi combinado nela (valores e condições específicas).
          </p>
        </header>

        <Section n={1} title="O serviço">
          <p>
            A PMS app fornece uma loja virtual pronta, no domínio do lojista, com catálogo, carrinho, pagamento por Pix e cartão (Mercado Pago), cálculo de
            frete, e-mails automáticos e painel de gestão. A PMS app cuida da hospedagem, da manutenção e das atualizações da plataforma.
          </p>
        </Section>

        <Section n={2} title="Implantação">
          <p>
            A taxa de implantação, quando houver, paga a criação e a configuração inicial da loja. Ela é cobrada uma única vez, no valor da proposta.
          </p>
          <p>
            Se o lojista desistir <strong>antes de a implantação começar</strong>, a taxa é devolvida integralmente. Depois de iniciada a implantação, a
            taxa <strong>não é reembolsável</strong>.
          </p>
        </Section>

        <Section n={3} title="Mensalidade e reajuste">
          <p>
            A mensalidade, no valor da proposta, vence <strong>todo dia {BILLING.dueDay}</strong>. A fatura fica disponível no painel (Assinatura) e é enviada
            por e-mail {BILLING.issueDaysBefore} dias antes do vencimento, para pagamento por Pix, cartão ou boleto.
          </p>
          <p>
            A mensalidade é reajustada <strong>uma vez por ano pelo IPCA</strong> (ou pelo índice que vier a substituí-lo), com aviso por e-mail com pelo
            menos 30 dias de antecedência.
          </p>
        </Section>

        <Section n={4} title="Atraso e suspensão">
          <p>
            Com a fatura vencida, o lojista é avisado por e-mail e no painel. Com <strong>mais de {BILLING.graceDays} dias de atraso</strong>, a loja sai do ar
            (o painel continua acessível). Assim que o pagamento é confirmado, a loja volta ao ar automaticamente.
          </p>
        </Section>

        <Section n={5} title="Cancelamento">
          <p>
            <strong>Não há fidelidade.</strong> O lojista pode cancelar a qualquer momento, avisando com <strong>30 dias de antecedência</strong> pelo e-mail{" "}
            {PLATFORM_CONTACT.email} ou pelo WhatsApp {PLATFORM_CONTACT.phoneDisplay}. A loja continua no ar durante o aviso, e a mensalidade desse período é
            devida. Não há multa.
          </p>
          <p>A PMS app também pode encerrar o contrato com o mesmo aviso de 30 dias, ou imediatamente em caso de uso ilegal da loja.</p>
        </Section>

        <Section n={6} title="Responsabilidades do lojista">
          <ul className="list-disc space-y-1 pl-5">
            <li>Os produtos, preços, descrições, fotos e o estoque que cadastra, e ter direito de usar as imagens e marcas publicadas.</li>
            <li>A venda em si: entrega, trocas e devoluções, atendimento ao cliente, emissão de nota fiscal e cumprimento do Código de Defesa do Consumidor.</li>
            <li>A própria conta no Mercado Pago (e no Melhor Envio, quando usar), incluindo as taxas cobradas por esses serviços.</li>
            <li>Manter em segredo a senha do painel e avisar a PMS app se suspeitar de acesso indevido.</li>
            <li>Não usar a loja para vender produtos ilegais, falsificados ou proibidos.</li>
          </ul>
        </Section>

        <Section n={7} title="Responsabilidades da PMS app">
          <ul className="list-disc space-y-1 pl-5">
            <li>Manter a loja e o painel funcionando, com hospedagem, atualizações e correções.</li>
            <li>Proteger os dados com medidas de segurança e manter backup diário do banco de dados.</li>
            <li>Dar suporte pelo WhatsApp e por e-mail em horário comercial.</li>
          </ul>
          <p>
            A PMS app trabalha para manter a loja sempre no ar, mas pode haver interrupções por manutenção ou por falhas de serviços de terceiros
            (hospedagem, Mercado Pago, Correios e transportadoras, provedores de e-mail). Manutenções planejadas serão feitas, sempre que possível, em
            horários de menor movimento.
          </p>
        </Section>

        <Section n={8} title="Pagamentos dos clientes">
          <p>
            O dinheiro das vendas cai <strong>direto na conta do Mercado Pago do lojista</strong>. A PMS app não recebe, não retém e não cobra comissão sobre
            as vendas. Estornos, contestações de cartão e devoluções de dinheiro são tratados entre o lojista, o cliente e o Mercado Pago.
          </p>
        </Section>

        <Section n={9} title="Dados pessoais (LGPD)">
          <p>
            Nos dados dos clientes da loja (nome, CPF, e-mail, telefone, endereço e pedidos), o lojista é o <strong>controlador</strong> e a PMS app é a{" "}
            <strong>operadora</strong>: trata esses dados só para fazer a loja funcionar, segundo as instruções do lojista, e não os vende nem os usa para
            outros fins.
          </p>
          <p>
            Ao fim do contrato, o lojista pode exportar os pedidos pela planilha do painel. A pedido dele, a PMS app apaga os dados da loja em até 30 dias,
            exceto o que a lei obrigar a guardar.
          </p>
        </Section>

        <Section n={10} title="Propriedade">
          <p>
            O domínio, a marca, os produtos, as fotos e os dados da loja são do lojista. O software da plataforma, o painel e o layout são da PMS app, que
            concede ao lojista o direito de usá-los enquanto o contrato estiver ativo.
          </p>
        </Section>

        <Section n={11} title="Limitação de responsabilidade">
          <p>
            A PMS app não responde por lucros cessantes nem por prejuízos indiretos, nem por falhas de serviços de terceiros. Em qualquer caso, a
            responsabilidade da PMS app fica limitada ao total pago pelo lojista nos 12 meses anteriores ao fato.
          </p>
        </Section>

        <Section n={12} title="Mudanças nestes termos">
          <p>
            A PMS app pode atualizar estes termos e avisará o lojista por e-mail com pelo menos 30 dias de antecedência. Se não concordar, o lojista pode
            cancelar sem custo dentro desse prazo.
          </p>
        </Section>

        <Section n={13} title="Foro">
          <p>Fica eleito o foro da comarca de {PLATFORM_LEGAL.forum} para resolver qualquer questão sobre estes termos.</p>
        </Section>

        <footer className="border-t pt-6 text-neutral-500">
          Dúvidas: {PLATFORM_CONTACT.email} · WhatsApp {PLATFORM_CONTACT.phoneDisplay}
        </footer>
      </article>
    </div>
  );
}
