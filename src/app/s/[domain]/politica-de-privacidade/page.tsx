import { PolicyPage } from "../policy-page";

export const revalidate = 60;
export const metadata = { title: "Política de privacidade", alternates: { canonical: "/politica-de-privacidade" } };

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ domain: string }> }) {
  return <PolicyPage domain={(await params).domain} kind="privacy" />;
}
