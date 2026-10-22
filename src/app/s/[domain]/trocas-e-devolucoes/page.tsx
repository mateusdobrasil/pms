import { PolicyPage } from "../policy-page";

export const revalidate = 60;
export const metadata = { title: "Trocas e devoluções", alternates: { canonical: "/trocas-e-devolucoes" } };

export default async function ReturnsPolicyPage({ params }: { params: Promise<{ domain: string }> }) {
  return <PolicyPage domain={(await params).domain} kind="returns" />;
}
