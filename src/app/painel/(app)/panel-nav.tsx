"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "../actions";

type Item = { href: string; label: string };
// heading: linha de título no topo da lista (o e-mail, na Conta); signOut: botão "Sair" no fim.
type Group = { label: string; items: Item[]; heading?: string; signOut?: boolean };
type Entry = Item | Group;

const isActive = (pathname: string, href: string) => (href === "/painel" ? pathname === "/painel" : pathname.startsWith(href));

const base = "whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition";
const tone = (active: boolean) => (active ? "bg-white/15 text-white" : "text-neutral-300 hover:bg-white/10 hover:text-white");

// Menu do painel, numa linha: Resumo, Clientes, Configurações e Ajuda direto; vendas, produtos, divulgação e a conta
// em grupos. "Agenda" aparece para quem usa agendamentos (ou já está montando a agenda); "Campanhas", para loja com
// cota de campanhas no WhatsApp.
export function PanelNav({ agenda = false, campaigns = false, email }: { agenda?: boolean; campaigns?: boolean; email: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [alignRight, setAlignRight] = useState(false);
  const nav = useRef<HTMLElement>(null);

  // Fecha o grupo aberto ao trocar de página ou ao tocar fora dele.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(null);
  }
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const entries: Entry[] = [
    { href: "/painel", label: "Resumo" },
    {
      label: "Vendas",
      items: [
        { href: "/painel/vender", label: "Vender no balcão" },
        { href: "/painel/pedidos", label: "Pedidos" },
        ...(agenda || pathname.startsWith("/painel/agenda") ? [{ href: "/painel/agenda", label: "Agenda" }] : []),
      ],
    },
    {
      label: "Produtos",
      items: [
        { href: "/painel/produtos", label: "Produtos" },
        { href: "/painel/categorias", label: "Categorias" },
      ],
    },
    {
      label: "Divulgar",
      items: [
        { href: "/painel/divulgar", label: "QR Code e link da bio" },
        { href: "/painel/links", label: "Links de pagamento" },
        { href: "/painel/cupons", label: "Cupons" },
        { href: "/painel/avaliacoes", label: "Avaliações" },
        ...(campaigns || pathname.startsWith("/painel/campanhas") ? [{ href: "/painel/campanhas", label: "Campanhas no WhatsApp" }] : []),
      ],
    },
    { href: "/painel/clientes", label: "Clientes" },
    { href: "/painel/configuracoes", label: "Configurações" },
    { href: "/painel/ajuda", label: "Ajuda" },
    {
      label: "Conta",
      heading: email ?? undefined,
      items: [
        { href: "/painel/conta", label: "Minha conta" },
        { href: "/painel/assinatura", label: "Assinatura" },
      ],
      signOut: true,
    },
  ];

  return (
    <nav ref={nav} className="flex flex-wrap gap-1 text-sm">
      {entries.map((e) => {
        if ("href" in e) {
          return (
            <Link key={e.href} href={e.href} className={`${base} ${tone(isActive(pathname, e.href))}`}>
              {e.label}
            </Link>
          );
        }
        const active = e.items.some((i) => isActive(pathname, i.href));
        const expanded = open === e.label;
        return (
          <div key={e.label} className="relative">
            <button
              type="button"
              aria-expanded={expanded}
              aria-haspopup="menu"
              onClick={(ev) => {
                // Perto da borda direita (celular estreito), a lista abre para a esquerda.
                setAlignRight(ev.currentTarget.getBoundingClientRect().left + 300 > window.innerWidth);
                setOpen(expanded ? null : e.label);
              }}
              className={`${base} ${tone(active || expanded)} inline-flex items-center gap-1`}
            >
              {e.label}
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            {expanded && (
              <div role="menu" className={`absolute ${alignRight ? "right-0" : "left-0"} top-full z-30 mt-1 min-w-52 rounded-lg border bg-white py-1 text-neutral-800 shadow-lg`}>
                {e.heading && <p className="max-w-72 truncate border-b px-4 pb-2 pt-1 text-xs text-neutral-500" title={e.heading}>{e.heading}</p>}
                {e.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    role="menuitem"
                    className={`block whitespace-nowrap px-4 py-2 text-sm hover:bg-neutral-100 ${isActive(pathname, i.href) ? "font-semibold text-primary-700" : ""}`}
                  >
                    {i.label}
                  </Link>
                ))}
                {e.signOut && (
                  <form action={signOut} className="border-t">
                    <button type="submit" role="menuitem" className="block w-full px-4 py-2 text-left text-sm hover:bg-neutral-100">Sair</button>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
