import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const { supabase, store } = await requireStore();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("store_id", store.id)
    .order("position")
    .order("name");

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/painel/produtos" className="text-sm text-neutral-500 underline">← Produtos</Link>
      <h1 className="text-2xl font-semibold">Novo produto</h1>
      <ProductForm categories={categories ?? []} />
    </div>
  );
}
