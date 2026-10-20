import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  return { title: store?.name ?? "Loja" };
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  return (
    <div style={{ "--brand": store.primary_color } as CSSProperties} className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold">{store.name}</Link>
          <Link href="/carrinho" className="text-sm">Carrinho</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      {store.whatsapp && (
        <a
          href={`https://wa.me/${store.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 rounded-full px-5 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: "var(--brand)" }}
        >
          Falar no WhatsApp
        </a>
      )}
    </div>
  );
}
