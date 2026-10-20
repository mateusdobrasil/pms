"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/painel", label: "Resumo" },
  { href: "/painel/pedidos", label: "Pedidos" },
  { href: "/painel/produtos", label: "Produtos" },
  { href: "/painel/categorias", label: "Categorias" },
  { href: "/painel/configuracoes", label: "Configurações" },
];

export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/painel" ? pathname === "/painel" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition ${
              active ? "bg-white/15 text-white" : "text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
