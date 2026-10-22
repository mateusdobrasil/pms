import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { getStoreLegal } from "@/lib/store-legal";
import { getStoreMarketing } from "@/lib/store-marketing";
import {
  POLICY_TEMPLATE_DATE,
  customPolicySections,
  privacyPolicyTemplate,
  returnsPolicyTemplate,
  type PolicySection,
  type PolicyStore,
} from "@/lib/policies";

export type PolicyKind = "privacy" | "returns";

export const POLICY_TITLES: Record<PolicyKind, string> = {
  privacy: "Política de privacidade",
  returns: "Trocas e devoluções",
};

// Página de política da loja: o texto próprio do lojista ou, se não houver, o modelo com os dados da loja.
export async function PolicyPage({ domain, kind }: { domain: string; kind: PolicyKind }) {
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const [legal, marketing] = await Promise.all([getStoreLegal(store.id), getStoreMarketing(store.id)]);

  const custom = kind === "privacy" ? legal.privacyPolicy : legal.returnsPolicy;
  const data: PolicyStore = {
    name: store.name,
    email: store.email,
    whatsapp: store.whatsapp,
    legalName: legal.legalName,
    document: legal.document,
    address: legal.address,
    hasAnalytics: !!(marketing.metaPixelId || marketing.gaMeasurementId),
  };
  const sections: PolicySection[] = custom
    ? customPolicySections(custom)
    : kind === "privacy"
      ? privacyPolicyTemplate(data)
      : returnsPolicyTemplate(data);

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{POLICY_TITLES[kind]}</h1>
        {!custom && <p className="mt-1 text-sm text-neutral-500">Última atualização: {POLICY_TEMPLATE_DATE}</p>}
      </header>
      {sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.title && <h2 className="text-lg font-semibold">{s.title}</h2>}
          {s.paragraphs.map((p, j) => (
            <p key={j} className="whitespace-pre-line leading-relaxed text-neutral-700">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
