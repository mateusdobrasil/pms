import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PlatformBrand } from "../brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · PMS app", robots: { index: false } };

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/painel");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PlatformBrand size="lg" />
        </div>
        <div className="rounded-2xl border bg-white p-8 shadow-lg shadow-primary-900/5">
          <h1 className="text-xl font-semibold tracking-tight">Painel da loja</h1>
          <p className="mt-1 text-sm text-neutral-600">Entre com o e-mail e a senha da sua conta.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
