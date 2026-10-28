import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { StockForm } from "./stock-form";

export const metadata = { title: "Estoque · Painel" };

// Ajuste de estoque sem o resto do cadastro (preço, fotos, descrição): a tela da Recepção.
export default async function StockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, store, role } = await requireStore("estoque");

  const { data: product } = await supabase
    .from("products")
    .select("id, name, product_variants(id, name, sku, stock, active, position)")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!product) notFound();
  const variants = ((product.product_variants ?? []) as { id: string; name: string; sku: string | null; stock: number; active: boolean; position: number }[]).sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/painel/produtos" className="text-sm text-neutral-500 hover:underline">← Produtos</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-sm text-neutral-600">
          Ajuste a quantidade em estoque de cada variação.
          {role === "owner" && (
            <>
              {" "}Para preço, fotos e o resto do cadastro,{" "}
              <Link href={`/painel/produtos/${product.id}`} className="font-medium text-primary-700 hover:underline">edite o produto</Link>.
            </>
          )}
        </p>
      </div>
      <StockForm productId={product.id} variants={variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, stock: v.stock, active: v.active }))} />
    </div>
  );
}
