"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/painel/agenda", label: "Agenda" },
  { href: "/painel/agenda/servicos", label: "Serviços" },
  { href: "/painel/agenda/profissionais", label: "Profissionais" },
  { href: "/painel/agenda/bloqueios", label: "Folgas e bloqueios" },
  { href: "/painel/agenda/pacotes", label: "Pacotes" },
  { href: "/painel/agenda/comissoes", label: "Comissões" },
];

export function AgendaTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b text-sm">
      {TABS.map((t) => {
        const active = t.href === "/painel/agenda" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium ${
              active ? "border-primary-600 text-primary-700" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
