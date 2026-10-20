import Link from "next/link";

export default function PlatformHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold">PMS app</span>
          <Link href="/painel/login" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Entrar no painel
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">Sua loja virtual pronta, com Pix e cartão.</h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-600">
          Para pequenos lojistas: catálogo com fotos e variações, checkout sem cadastro, pagamento pelo Mercado Pago e
          painel para acompanhar pedidos.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/painel/login" className="rounded-md bg-neutral-900 px-5 py-3 text-sm font-medium text-white">
            Já sou lojista — entrar
          </Link>
        </div>
      </main>

      <footer className="border-t">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-neutral-500">PMS app</p>
      </footer>
    </div>
  );
}
