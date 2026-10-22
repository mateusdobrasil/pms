import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { centsToInput } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { ProductForm } from "../product-form";
import { VariantsEditor } from "../variants-editor";
import { ImagesManager } from "../images-manager";
import { VideosManager } from "../videos-manager";
import { DeleteProductButton } from "../delete-product-button";
import { duplicateProduct } from "../actions";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  stock: number;
  weight_g: number;
  height_cm: number;
  width_cm: number;
  length_cm: number;
  active: boolean;
  position: number;
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criado?: string; copiado?: string }>;
}) {
  const { id } = await params;
  const { criado, copiado } = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase, store } = await requireStore();

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, description, category_id, active, featured, product_variants(id, name, sku, price_cents, compare_at_cents, stock, weight_g, height_cm, width_cm, length_cm, active, position), product_images(id, path, position)",
      )
      .eq("id", id)
      .eq("store_id", store.id)
      .maybeSingle(),
    supabase.from("categories").select("id, name").eq("store_id", store.id).order("position").order("name"),
  ]);
  if (!product) notFound();
  // Consulta à parte: sem o SQL dos vídeos rodado, a página segue sem essa seção.
  const { data: videos, error: videosError } = await supabase
    .from("product_videos")
    .select("id, path")
    .eq("product_id", product.id)
    .eq("store_id", store.id)
    .order("position");

  const variants = [...(product.product_variants as Variant[])].sort((a, b) => a.position - b.position);
  const images = [...(product.product_images as { id: string; path: string; position: number }[])].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/painel/produtos" className="text-sm text-neutral-500 underline">← Produtos</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <form action={duplicateProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400">
              Duplicar produto
            </button>
          </form>
        </div>
        {criado && <p className="mt-1 text-sm text-green-700">Produto criado. Agora adicione fotos e variações.</p>}
        {copiado && (
          <p className="mt-1 text-sm text-green-700">
            Cópia criada, ainda escondida da loja e com estoque zerado. Ajuste nome, variações e estoque, e marque
            “Visível na loja”.
          </p>
        )}
      </div>

      <ProductForm product={product} categories={categories ?? []} />

      <ImagesManager storeId={store.id} productId={product.id} images={images} />

      {!videosError && <VideosManager storeId={store.id} productId={product.id} videos={videos ?? []} />}

      <VariantsEditor
        productId={product.id}
        variants={variants.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: centsToInput(v.price_cents),
          compareAt: centsToInput(v.compare_at_cents),
          stock: v.stock,
          weightG: v.weight_g,
          heightCm: Number(v.height_cm),
          widthCm: Number(v.width_cm),
          lengthCm: Number(v.length_cm),
          active: v.active,
        }))}
      />

      <DeleteProductButton id={product.id} />
    </div>
  );
}
