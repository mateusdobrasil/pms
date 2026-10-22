import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { PlatformBrand } from "../painel/brand";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = { title: "Verificação em duas etapas · PMS app", robots: { index: false } };

// Verificação em duas etapas do super-admin: cadastro do autenticador (primeira vez) ou código de 6 dígitos.
export default async function AdminTwoFactorPage() {
  const session = await getAdminSession();
  if (session.status === "anonymous") redirect("/painel/login");
  if (session.status === "not-admin") notFound();
  if (session.verified) redirect("/admin");

  const { data } = await session.supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0] ?? null; // só fatores já confirmados

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PlatformBrand size="lg" />
        </div>
        <div className="rounded-2xl border bg-white p-8 shadow-lg shadow-primary-900/5">
          <TwoFactorForm mode={factor ? "verify" : "enroll"} factorId={factor?.id ?? null} email={session.email} />
        </div>
      </div>
    </main>
  );
}
