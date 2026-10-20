import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · PMS app", robots: { index: false } };

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/painel");

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Painel da loja</h1>
      <p className="mt-1 text-sm text-neutral-600">Entre com o e-mail e a senha da sua conta.</p>
      <LoginForm />
    </main>
  );
}
