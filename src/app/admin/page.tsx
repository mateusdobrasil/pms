import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { CreateStoreForm } from "./forms";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  store_domains: { domain: string; is_primary: boolean }[];
  store_members: { user_id: string }[];
};

export default async function AdminHome() {
  const { db } = await requireAdmin();
  const { data } = await db
    .from("stores")
    .select("id, name, slug, status, created_at, store_domains(domain, is_primary), store_members(user_id)")
    .order("created_at", { ascending: false });
  const stores = (data ?? []) as Row[];

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section className="space-y-4 lg:col-span-2">
        <h1 className="text-2xl font-semibold tracking-tight">Lojas ({stores.length})</h1>
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {stores.map((s) => {
            const primary = s.store_domains.find((d) => d.is_primary) ?? s.store_domains[0];
            return (
              <li key={s.id}>
                <Link href={`/admin/lojas/${s.id}`} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-neutral-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name}</p>
                    <p className="truncate text-neutral-500">
                      {primary?.domain ?? "sem domínio"} · {s.store_members.length} usuário(s) · criada em {formatDateTime(s.created_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      s.status === "active" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-red-100 text-red-800 ring-red-200"
                    }`}
                  >
                    {s.status === "active" ? "Ativa" : "Suspensa"}
                  </span>
                </Link>
              </li>
            );
          })}
          {stores.length === 0 && <li className="px-4 py-8 text-center text-neutral-500">Nenhuma loja ainda.</li>}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Nova loja</h2>
        <CreateStoreForm />
      </section>
    </div>
  );
}
