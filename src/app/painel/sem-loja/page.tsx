import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel";
import { signOut } from "../actions";
import { PlatformBrand } from "../brand";

export const metadata = { title: "Painel · PMS app", robots: { index: false } };

export default async function NoStorePage() {
  const { store, email } = await getPanelContext();
  if (store) redirect("/painel");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <PlatformBrand size="lg" />
        </div>
        <div className="rounded-2xl border bg-white p-8 shadow-lg shadow-primary-900/5">
          <h1 className="text-xl font-semibold tracking-tight">Nenhuma loja vinculada</h1>
          <p className="mt-2 text-sm text-neutral-600">
            A conta <strong>{email}</strong> ainda não está ligada a nenhuma loja. Fale com o suporte para concluir a
            implantação.
          </p>
          <form action={signOut} className="mt-6">
            <button type="submit" className="text-sm font-medium text-primary-700 hover:underline">Sair</button>
          </form>
        </div>
      </div>
    </main>
  );
}
