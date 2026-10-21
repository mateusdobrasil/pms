"use client";

import { usePathname } from "next/navigation";
import { WhatsappIcon } from "../../whatsapp-button";

// Botão flutuante de WhatsApp da loja. No celular vira só o ícone, para não cobrir preços e botões,
// e some no checkout (o cliente está pagando; o WhatsApp continua no rodapé).
export function StoreWhatsappButton({ whatsapp }: { whatsapp: string }) {
  const pathname = usePathname();
  if (pathname?.endsWith("/checkout")) return null;
  // Na página do pedido (pagamento) o ícone cobria o formulário do cartão no celular.
  const hideOnMobile = pathname?.includes("/pedido/");
  return (
    <a
      href={`https://wa.me/${whatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a loja no WhatsApp"
      className={`fixed z-30 h-14 w-14 ${hideOnMobile ? "hidden" : "grid"} place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:brightness-95 sm:flex sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3 sm:text-sm sm:font-semibold`}
      style={{
        right: "max(16px, env(safe-area-inset-right, 0px))",
        bottom: "max(16px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <WhatsappIcon className="h-7 w-7 sm:h-5 sm:w-5" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
