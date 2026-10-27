// Contato da plataforma PMS app (site e tela de login). Trocar aqui atualiza todos os lugares.
export const PLATFORM_CONTACT = {
  phoneDisplay: "(11) 97336-7502",
  phoneTel: "+5511973367502",
  whatsapp: "5511973367502",
  email: "contato@pmsapp.dev",
  webmailUrl: "https://mail.umbler.com", // caixa de contato@pmsapp.dev (Umbler)
  whatsappMessage: "Olá! Quero saber mais sobre a loja virtual do PMS app.",
  demoStoreUrl: "https://pms.minhaloja.promo", // loja de demonstração (Loja Teste): produtos, agenda e avaliações de exemplo
};

export function platformWhatsappUrl(message = PLATFORM_CONTACT.whatsappMessage) {
  return `https://wa.me/${PLATFORM_CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}
