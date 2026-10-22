import { formatDocument, formatPhone } from "@/lib/format";

// Textos-modelo das políticas da loja, montados com os dados dela.
// Cobrem o mínimo do CDC (arrependimento em 7 dias, garantia legal) e da LGPD (dados, finalidades,
// compartilhamento, direitos). O lojista pode trocar por um texto próprio em Configurações.

export const POLICY_TEMPLATE_DATE = "outubro de 2026";

export type PolicySection = { title: string; paragraphs: string[] };

export type PolicyStore = {
  name: string;
  email: string | null;
  whatsapp: string | null; // com DDI 55
  legalName: string | null;
  document: string | null;
  address: string | null;
  hasAnalytics: boolean; // Pixel da Meta ou Google Analytics configurado
};

function identity(s: PolicyStore) {
  const who = s.legalName ?? s.name;
  const doc = s.document ? `, ${s.document.length === 14 ? "CNPJ" : "CPF"} ${formatDocument(s.document)}` : "";
  const addr = s.address ? `, com endereço em ${s.address}` : "";
  return `${who}${doc}${addr}`;
}

function contact(s: PolicyStore) {
  const ways = [
    s.email && `pelo e-mail ${s.email}`,
    s.whatsapp && `pelo WhatsApp ${formatPhone(s.whatsapp.replace(/^55/, ""))}`,
  ].filter(Boolean);
  return ways.length ? ways.join(" ou ") : "pelos canais de atendimento informados nesta loja";
}

export function privacyPolicyTemplate(s: PolicyStore): PolicySection[] {
  return [
    {
      title: "Quem somos",
      paragraphs: [
        `Esta é a loja virtual ${s.name}, mantida por ${identity(s)}. Somos os responsáveis (controladores) pelos dados pessoais que você informa aqui, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
      ],
    },
    {
      title: "Quais dados coletamos",
      paragraphs: [
        "Para processar a sua compra, pedimos nome, CPF, e-mail, celular e, quando há entrega, o endereço. Também registramos os produtos comprados, os valores e a situação do pagamento e da entrega.",
        "Não temos acesso aos dados do seu cartão: eles são digitados em um formulário seguro do Mercado Pago e ficam só com ele.",
      ],
    },
    {
      title: "Para que usamos",
      paragraphs: [
        "Usamos os seus dados para registrar e entregar o pedido, confirmar o pagamento, enviar e-mails sobre a compra (confirmação, envio e rastreio), prestar atendimento, prevenir fraudes e cumprir obrigações legais e fiscais.",
        "Não vendemos os seus dados e não enviamos propaganda por e-mail sem o seu consentimento.",
      ],
    },
    {
      title: "Com quem compartilhamos",
      paragraphs: [
        "Compartilhamos apenas o necessário para concluir a compra: com o Mercado Pago, que processa o pagamento; com o Melhor Envio e a transportadora escolhida, que fazem a entrega; e com a PMS app, plataforma que hospeda esta loja e envia os e-mails do pedido em nosso nome.",
        "Também podemos informar dados a autoridades públicas quando a lei exigir.",
      ],
    },
    {
      title: "Cookies e medição de visitas",
      paragraphs: [
        "Guardamos o seu carrinho no próprio navegador, o que é necessário para a loja funcionar.",
        s.hasAnalytics
          ? "Com a sua autorização (botão \"Aceitar\" no aviso de cookies), usamos ferramentas de medição e anúncios, como o Pixel da Meta e o Google Analytics, para entender as visitas e melhorar nossos anúncios. Se você recusar, essas ferramentas não são carregadas. Para mudar a sua escolha, limpe os dados deste site no navegador e o aviso aparece de novo."
          : "Não usamos cookies de medição ou de anúncios.",
      ],
    },
    {
      title: "Por quanto tempo guardamos",
      paragraphs: [
        "Guardamos os dados do pedido pelo tempo necessário para a entrega, o atendimento, a garantia e o cumprimento de obrigações legais. Registros fiscais e de compra são mantidos pelos prazos exigidos em lei (em geral, 5 anos).",
      ],
    },
    {
      title: "Seus direitos",
      paragraphs: [
        `Você pode pedir a confirmação de que tratamos seus dados, o acesso a eles, a correção, a exclusão dos que não precisamos mais guardar por lei, a portabilidade e informações sobre o compartilhamento. Para isso, fale com a gente ${contact(s)}. Respondemos em até 15 dias.`,
      ],
    },
    {
      title: "Segurança",
      paragraphs: [
        "Os dados trafegam com criptografia (HTTPS) e ficam em servidores com acesso restrito. Só as pessoas que cuidam dos pedidos têm acesso a eles.",
      ],
    },
    {
      title: "Mudanças nesta política",
      paragraphs: ["Podemos atualizar esta política. A versão em vigor é sempre a publicada nesta página."],
    },
  ];
}

export function returnsPolicyTemplate(s: PolicyStore): PolicySection[] {
  return [
    {
      title: "Direito de arrependimento (7 dias)",
      paragraphs: [
        "Você pode desistir da compra em até 7 dias corridos a partir do recebimento do produto, sem precisar dizer o motivo (art. 49 do Código de Defesa do Consumidor).",
        `Para isso, fale com a gente ${contact(s)}, informando o número do pedido. Combinaremos a devolução, sem custo para você, e devolveremos o valor total pago, incluindo o frete.`,
      ],
    },
    {
      title: "Produto com defeito",
      paragraphs: [
        "Se o produto apresentar defeito, você tem 30 dias para reclamar, no caso de produtos não duráveis, ou 90 dias, no caso de produtos duráveis, contados do recebimento (art. 26 do CDC). Se o defeito não for aparente, o prazo começa quando ele for percebido.",
        "Avaliaremos o produto e faremos o conserto ou a troca em até 30 dias. Se isso não for possível, você escolhe entre a troca por outro produto, a devolução do valor ou o abatimento proporcional do preço.",
      ],
    },
    {
      title: "Troca por tamanho, cor ou modelo",
      paragraphs: [
        `Quer trocar por outro tamanho, cor ou modelo? Fale com a gente ${contact(s)} antes de enviar o produto, para verificarmos a disponibilidade e combinarmos a troca.`,
      ],
    },
    {
      title: "Como devolver",
      paragraphs: [
        "Envie o produto na embalagem original ou bem protegido, com todos os acessórios e, se possível, com a nota fiscal. Antes de enviar, aguarde as nossas instruções: indicaremos a forma de envio.",
      ],
    },
    {
      title: "Como recebo o dinheiro de volta",
      paragraphs: [
        "Pagamentos com cartão são estornados pelo Mercado Pago, e o crédito aparece na fatura conforme o prazo da operadora do cartão (em geral, uma ou duas faturas). Pagamentos com Pix são devolvidos para a conta de origem.",
        "O reembolso é solicitado em até 5 dias úteis depois que recebemos o produto de volta.",
      ],
    },
    {
      title: "Quem somos",
      paragraphs: [`${s.name} · ${identity(s)}.`],
    },
  ];
}

// Texto próprio do lojista: parágrafos separados por linha em branco; linhas que terminam sem ponto
// e são curtas viram títulos ("Trocas", "Prazo de devolução"...).
export function customPolicySections(text: string): PolicySection[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const sections: PolicySection[] = [];
  for (const block of blocks) {
    const isTitle = block.length <= 80 && !block.includes("\n") && !/[.!?:;,]$/.test(block);
    if (isTitle) sections.push({ title: block, paragraphs: [] });
    else if (sections.length) sections[sections.length - 1].paragraphs.push(block);
    else sections.push({ title: "", paragraphs: [block] });
  }
  return sections;
}

// Modelo → texto editável no painel (mesmo formato que customPolicySections lê de volta).
export function policyToText(sections: PolicySection[]) {
  return sections.map((s) => [s.title, ...s.paragraphs].filter(Boolean).join("\n\n")).join("\n\n");
}
