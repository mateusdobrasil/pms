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
  about: string | null; // "Quem somos" escrito pelo lojista (vazio = só o nome da loja)
  hasAnalytics: boolean; // Pixel da Meta ou Google Analytics configurado
  features?: PolicyFeatures; // recursos ligados (sem isso, só a compra e as avaliações)
};

// Recursos que coletam dados além da compra; a política só fala do que a loja usa.
export type PolicyFeatures = {
  booking: boolean; // agenda online
  whatsapp: boolean; // avisos pelo WhatsApp oficial da plataforma
  campaigns: boolean; // novidades e promoções pelo WhatsApp (com aceite)
  birthday: boolean; // cupom de aniversário
};
const NO_FEATURES: PolicyFeatures = { booking: false, whatsapp: false, campaigns: false, birthday: false };

// Quem responde pela loja, sem repetir o nome dela: razão social (quando diferente do nome), documento e endereço.
function legalParts(s: PolicyStore) {
  return {
    maintainer: s.legalName && s.legalName.trim().toLowerCase() !== s.name.trim().toLowerCase() ? s.legalName : null,
    details: [
      s.document && `${s.document.length === 14 ? "CNPJ" : "CPF"} ${formatDocument(s.document)}`,
      s.address && `endereço: ${s.address}`,
    ].filter(Boolean) as string[],
  };
}

// ", mantida por Razão Ltda (CNPJ …, endereço: …)": só o que estiver preenchido.
function maintainedBy(s: PolicyStore) {
  const { maintainer, details } = legalParts(s);
  return `${maintainer ? `, mantida por ${maintainer}` : ""}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function contact(s: PolicyStore) {
  const ways = [
    s.email && `pelo e-mail ${s.email}`,
    s.whatsapp && `pelo WhatsApp ${formatPhone(s.whatsapp.replace(/^55/, ""))}`,
  ].filter(Boolean);
  return ways.length ? ways.join(" ou ") : "pelos canais de atendimento informados nesta loja";
}

export function privacyPolicyTemplate(s: PolicyStore): PolicySection[] {
  const f = s.features ?? NO_FEATURES;
  const list = (items: (string | false)[]) => items.filter(Boolean) as string[];
  return [
    {
      title: "Quem somos",
      paragraphs: [
        `Esta é a loja virtual ${s.name}${maintainedBy(s)}. Somos os responsáveis (controladores) pelos dados pessoais que você informa aqui, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
      ],
    },
    {
      title: "Quais dados coletamos",
      paragraphs: list([
        "Para processar a sua compra, pedimos nome, CPF, e-mail, celular e, quando há entrega, o endereço. Também registramos os produtos comprados, os valores e a situação do pagamento e da entrega.",
        f.booking &&
          "Ao agendar um horário, registramos também o serviço, o profissional, a data, a hora e as observações que você escrever. O CPF só é pedido quando há pagamento online.",
        f.birthday && "Se você quiser, o dia e o mês do seu aniversário (sem o ano), para receber um cupom de presente.",
        "Se você avaliar uma compra ou um atendimento, a nota e o comentário.",
        "Não temos acesso aos dados do seu cartão: eles são digitados em um formulário seguro do Mercado Pago e ficam só com ele.",
      ]),
    },
    {
      title: "Para que usamos",
      paragraphs: list([
        `Usamos os seus dados para registrar e entregar o pedido${f.booking ? ", confirmar e lembrar o seu horário" : ""}, confirmar o pagamento, enviar e-mails sobre a compra (confirmação, envio e rastreio)${f.whatsapp ? " e avisos pelo WhatsApp sobre o seu pedido ou horário" : ""}, prestar atendimento, prevenir fraudes e cumprir obrigações legais e fiscais.`,
        "Depois da entrega ou do atendimento, enviamos um convite para você avaliar, se quiser.",
        f.birthday && "Com o seu aniversário, enviamos no dia um cupom de presente, por e-mail (e pelo WhatsApp, se você aceitou receber novidades).",
        f.campaigns &&
          "Novidades e promoções pelo WhatsApp só chegam se você marcar a caixa \"Quero receber novidades e promoções\" na compra ou no agendamento. Cada mensagem traz um link para sair da lista, e você sai na hora.",
        "Não vendemos os seus dados e não enviamos propaganda sem o seu consentimento.",
      ]),
    },
    {
      title: "Avaliações",
      paragraphs: [
        "As avaliações aparecem na loja com o seu primeiro nome e a inicial do sobrenome (por exemplo, \"Ana S.\"), a nota, o comentário e o mês. Nunca publicamos e-mail, telefone, CPF ou endereço. Podemos responder publicamente e ocultar avaliações ofensivas.",
        `Para tirar a sua avaliação da loja, fale com a gente ${contact(s)}.`,
      ],
    },
    {
      title: "Com quem compartilhamos",
      paragraphs: list([
        `Compartilhamos apenas o necessário para concluir a compra: com o Mercado Pago, que processa o pagamento; com o Melhor Envio e a transportadora escolhida, que fazem a entrega; e com a PMS app, plataforma que hospeda esta loja e envia os e-mails${f.whatsapp ? " e as mensagens de WhatsApp" : ""} em nosso nome.`,
        f.whatsapp && "As mensagens de WhatsApp são enviadas pelo número oficial da PMS app na plataforma da Meta (WhatsApp Business), que recebe o seu número de celular e o texto da mensagem para entregá-la.",
        "Também podemos informar dados a autoridades públicas quando a lei exigir.",
      ]),
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
      paragraphs: list([
        "Guardamos os dados do pedido pelo tempo necessário para a entrega, o atendimento, a garantia e o cumprimento de obrigações legais. Registros fiscais e de compra são mantidos pelos prazos exigidos em lei (em geral, 5 anos).",
        f.campaigns && "O aceite para receber novidades vale até você sair da lista.",
        f.birthday && "O aniversário fica guardado até você pedir para apagar.",
      ]),
    },
    {
      title: "Seus direitos",
      paragraphs: [
        `Você pode pedir a confirmação de que tratamos seus dados, o acesso a eles, a correção, a exclusão dos que não precisamos mais guardar por lei, a portabilidade e informações sobre o compartilhamento${f.campaigns || f.birthday ? ", e retirar a qualquer momento o consentimento que deu (por exemplo, para novidades pelo WhatsApp ou o cupom de aniversário)" : ""}. Para isso, fale com a gente ${contact(s)}. Respondemos em até 15 dias.`,
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
      paragraphs: aboutParagraphs(s),
    },
  ];
}

// "Quem somos": o texto do lojista (ou só o nome da loja) e, se houver, a identificação legal.
function aboutParagraphs(s: PolicyStore) {
  const about = s.about?.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) ?? [];
  const { maintainer, details } = legalParts(s);
  const legal = [maintainer, ...details].filter(Boolean).join(" · ");
  // Sem texto próprio: uma frase só, com o nome e (se houver) a identificação. Termina em ponto para não virar título ao editar.
  if (!about.length) return [`${[s.name, legal].filter(Boolean).join(" · ")}.`];
  const sentence = (p: string) => (/[.!?…]$/.test(p) ? p : `${p}.`);
  return [...about.map(sentence), ...(legal ? [`${legal}.`] : [])];
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
