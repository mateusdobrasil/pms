import { getPanelContext } from "@/lib/panel";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { email } = await getPanelContext();
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p className="mt-1 text-sm text-neutral-600">Você entra no painel com {email}.</p>
      </div>
      <PasswordForm />
    </div>
  );
}
