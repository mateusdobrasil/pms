// Primeiros passos da loja (assistente de implantação): cada passo se marca sozinho pelo estado real da loja.
// Regras puras, testadas em tests/setup.test.ts; os dados vêm de loadSetupState (setup-server.ts).

export type SetupState = {
  hasLogo: boolean;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  hasLegal: boolean; // razão social ou nome, CPF/CNPJ e endereço (rodapé exigido por lei)
  products: number;
  bookingEnabled: boolean;
  services: number;
  bookableProfessionals: number; // profissionais com horário de trabalho
  hasOriginZip: boolean;
  hasShippingOption: boolean; // retirada, transportadoras ou entrega própria ligada
  paymentConfigured: boolean; // Mercado Pago com credenciais (a PMS app configura)
  paymentLive: boolean; // credenciais de produção
  testSale: boolean; // já houve pedido pago ou agendamento com pagamento online
  pushDevices: number;
  hasInstagramOrBio: boolean;
};

export type SetupStep = { key: string; label: string; hint: string; done: boolean; required: boolean; href: string | null };

export function setupSteps(s: SetupState): SetupStep[] {
  const sellsProducts = s.products > 0;
  const agendaReady = s.bookingEnabled && s.services > 0 && s.bookableProfessionals > 0;
  const steps: SetupStep[] = [
    { key: "marca", label: "Logo e cor da loja", hint: "Configurações → Aparência.", done: s.hasLogo, required: true, href: "/painel/configuracoes" },
    {
      key: "contato",
      label: "E-mail e WhatsApp da loja",
      hint: "É para onde vão os avisos de venda e o botão de atendimento.",
      done: s.hasEmail && s.hasWhatsapp,
      required: true,
      href: "/painel/configuracoes",
    },
    {
      key: "empresa",
      label: "Dados da empresa",
      hint: "Nome, CPF ou CNPJ e endereço: a lei exige no rodapé de quem vende pela internet.",
      done: s.hasLegal,
      required: true,
      href: "/painel/configuracoes",
    },
    {
      key: "catalogo",
      label: "Cadastre o que você vende",
      hint: "Um produto com foto e preço, ou a agenda ligada com um serviço e um profissional com horário.",
      done: sellsProducts || agendaReady,
      required: true,
      href: sellsProducts || !s.bookingEnabled ? "/painel/produtos" : "/painel/agenda",
    },
  ];
  // Entrega só faz sentido para quem vende produto.
  if (sellsProducts) {
    steps.push({
      key: "entrega",
      label: "Formas de entrega",
      hint: "CEP de onde você envia e ao menos uma opção: retirada, Correios ou entrega própria.",
      done: s.hasOriginZip && s.hasShippingOption,
      required: true,
      href: "/painel/configuracoes",
    });
  }
  steps.push(
    {
      key: "pagamento",
      label: s.paymentLive ? "Pagamento ativado" : "Pagamento (Mercado Pago)",
      hint: s.paymentConfigured
        ? s.paymentLive
          ? "Pix e cartão recebendo de verdade, direto na sua conta."
          : "Em modo de teste: a PMS app ativa os pagamentos de verdade depois da compra de teste."
        : "A PMS app conecta a sua conta do Mercado Pago com você.",
      done: s.paymentConfigured,
      required: true,
      href: null,
    },
    {
      key: "teste",
      label: "Faça uma compra de teste",
      hint: "Use o link de teste no topo do painel e compre (ou agende) como um cliente.",
      done: s.testSale,
      required: true,
      href: null,
    },
    {
      key: "celular",
      label: "Aviso de venda no celular",
      hint: "Ative neste aparelho, no cartão logo acima.",
      done: s.pushDevices > 0,
      required: false,
      href: "/painel",
    },
    {
      key: "divulgar",
      label: "Instagram e link da bio",
      hint: "O @ da loja em Configurações e a página de links em Divulgar.",
      done: s.hasInstagramOrBio,
      required: false,
      href: "/painel/divulgar",
    },
  );
  return steps;
}

export function setupProgress(steps: SetupStep[]) {
  const required = steps.filter((s) => s.required);
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    requiredLeft: required.filter((s) => !s.done).length,
    ready: required.every((s) => s.done),
  };
}
