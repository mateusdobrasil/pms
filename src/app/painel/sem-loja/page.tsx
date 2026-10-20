import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel";
import { signOut } from "../actions";

export const metadata = { title: "Painel · PMS app", robots: { index: false } };

export default async function NoStorePage() {
  const { store, email } = await getPanelContext();
  if (store) redirect("/painel");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Nenhuma loja vinculada</h1>
      <p className="mt-2 text-neutral-600">
        A conta {email} ainda não está ligada a nenhuma loja. Fale com o suporte para concluir a implantação.
      </p>
      <form action={signOut} className="mt-6">
        <button type="submit" className="text-sm underline">Sair</button>
      </form>
    </main>
  );
}
