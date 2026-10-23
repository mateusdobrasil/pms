"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyBackInStock } from "@/lib/email";
import { requireStore } from "@/lib/panel";
import { centsToInput, parseBRL } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { isUuid } from "@/lib/validation";
import { thumbPath } from "@/lib/images";

// Tudo com o cliente da sessão: o RLS ("members manage ...") restringe à loja do lojista.
// Mesmo assim filtramos por store_id em toda consulta, como manda a regra do projeto.

export type FormState = { error?: string; ok?: string } | null;

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function readProductFields(form: FormData) {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const slug = slugify(String(form.get("slug") ?? "") || name);
  const description = String(form.get("description") ?? "").trim();
  const categoryId = String(form.get("categoryId") ?? "");
  // Aceita o link colado sem "https://" (ex.: instagram.com/reel/...).
  const instagramUrl = String(form.get("instagram_url") ?? "")
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, "https://www.instagram.com/");
  return {
    name,
    slug,
    description: description || null,
    category_id: isUuid(categoryId) ? categoryId : null,
    active: form.get("active") === "on",
    featured: form.get("featured") === "on",
    instagram_url: instagramUrl || null,
  };
}

function validateProduct(p: ReturnType<typeof readProductFields>) {
  if (p.name.length < 2 || p.name.length > 120) return "Informe o nome do produto (até 120 caracteres).";
  if (!p.slug) return "Endereço (slug) inválido.";
  if (p.description && p.description.length > 5000) return "Descrição muito longa (até 5.000 caracteres).";
  if (p.instagram_url && !/^https:\/\/(www\.)?instagram\.com\/\S+$/.test(p.instagram_url)) {
    return "Link do Instagram inválido: copie o link do Reel ou do post (começa com https://www.instagram.com/).";
  }
  return null;
}

async function assertCategory(supabase: Awaited<ReturnType<typeof requireStore>>["supabase"], storeId: string, id: string | null) {
  if (!id) return true;
  const { data } = await supabase.from("categories").select("id").eq("id", id).eq("store_id", storeId).maybeSingle();
  return !!data;
}

// Remove fotos (e as miniaturas) do bucket. Uma falha não desfaz a exclusão no banco; só deixa o arquivo órfão (fica no log).
async function removeFiles(supabase: Awaited<ReturnType<typeof requireStore>>["supabase"], paths: string[]) {
  const { data, error } = await supabase.storage.from("product-images").remove([...paths, ...paths.map(thumbPath)]);
  // Fotos antigas não têm miniatura: confere só as fotos.
  const removed = new Set(data?.map((o) => o.name));
  if (error || paths.some((p) => !removed.has(p))) {
    console.error("Arquivos não removidos do Storage", { paths, removed: data?.length ?? 0, error });
  }
}

function revalidateProduct(id?: string) {
  revalidatePath("/painel/produtos");
  if (id) revalidatePath(`/painel/produtos/${id}`);
}

export async function createProduct(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, store } = await requireStore();
  const product = readProductFields(form);
  const invalid = validateProduct(product);
  if (invalid) return { error: invalid };

  const price = parseBRL(String(form.get("price") ?? ""));
  if (price === null) return { error: "Preço inválido. Use o formato 79,90." };
  const stock = Number(form.get("stock") ?? 0);
  if (!Number.isInteger(stock) || stock < 0) return { error: "Estoque inválido." };
  if (!(await assertCategory(supabase, store.id, product.category_id))) return { error: "Categoria inválida." };

  const { data, error } = await supabase
    .from("products")
    .insert({ ...product, store_id: store.id })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "Já existe um produto com esse endereço (slug)." : "Não foi possível salvar o produto." };
  }

  const { error: vErr } = await supabase
    .from("product_variants")
    .insert({ store_id: store.id, product_id: data.id, name: "Único", price_cents: price, stock });
  if (vErr) {
    await supabase.from("products").delete().eq("id", data.id).eq("store_id", store.id);
    return { error: "Não foi possível salvar o produto." };
  }

  revalidateProduct();
  redirect(`/painel/produtos/${data.id}?criado=1`);
}

export async function updateProduct(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Produto não encontrado." };

  const product = readProductFields(form);
  const invalid = validateProduct(product);
  if (invalid) return { error: invalid };
  if (!(await assertCategory(supabase, store.id, product.category_id))) return { error: "Categoria inválida." };

  const { data, error } = await supabase
    .from("products")
    .update(product)
    .eq("id", id)
    .eq("store_id", store.id)
    .select("id");
  if (error) {
    return { error: error.code === "23505" ? "Já existe um produto com esse endereço (slug)." : "Não foi possível salvar." };
  }
  if (!data?.length) return { error: "Produto não encontrado." };

  revalidateProduct(id);
  after(() => notifyBackInStock(store.id)); // produto que voltou a ficar visível
  return { ok: "Produto salvo." };
}

export async function deleteProduct(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;

  const { data: images } = await supabase
    .from("product_images")
    .select("path")
    .eq("product_id", id)
    .eq("store_id", store.id);

  // Itens de pedidos antigos guardam nome e preço copiados, então o histórico continua intacto.
  const { error } = await supabase.from("products").delete().eq("id", id).eq("store_id", store.id);
  if (error) throw error;

  if (images?.length) await removeFiles(supabase, images.map((i) => i.path));

  revalidateProduct();
  redirect("/painel/produtos");
}

// Cria uma cópia oculta do produto (variações, fotos, link do Instagram e categoria), para o lojista ajustar e publicar.
// O estoque da cópia começa em zero: estoque é coisa física, não se duplica.
export async function duplicateProduct(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;

  const { data: source } = await supabase
    .from("products")
    .select(
      "name, slug, description, category_id, instagram_url, product_variants(name, sku, price_cents, compare_at_cents, weight_g, height_cm, width_cm, length_cm, active, position), product_images(path, position)",
    )
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!source) return;

  // Primeiro endereço livre: camiseta-copia, camiseta-copia-2, ...
  const base = `${source.slug}-copia`.slice(0, 90);
  const { data: taken } = await supabase.from("products").select("slug").eq("store_id", store.id).like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((p) => p.slug as string));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  const { data: copy, error } = await supabase
    .from("products")
    .insert({
      store_id: store.id,
      name: `${source.name} (cópia)`.slice(0, 120),
      slug,
      description: source.description,
      category_id: source.category_id,
      instagram_url: source.instagram_url,
      active: false,
      featured: false,
    })
    .select("id")
    .single();
  if (error) throw error;

  const variants = source.product_variants as Record<string, unknown>[];
  if (variants.length) {
    const { error: vErr } = await supabase
      .from("product_variants")
      .insert(variants.map((v) => ({ ...v, sku: null, stock: 0, store_id: store.id, product_id: copy.id })));
    if (vErr) {
      await supabase.from("products").delete().eq("id", copy.id).eq("store_id", store.id);
      throw vErr;
    }
  }

  // Fotos: copia o arquivo para a pasta do novo produto. Se uma falhar, segue sem ela.
  for (const img of source.product_images as { path: string; position: number }[]) {
    const ext = img.path.split(".").pop();
    const path = `${store.id}/${copy.id}/${crypto.randomUUID()}.${ext}`;
    const { error: cErr } = await supabase.storage.from("product-images").copy(img.path, path);
    if (cErr) {
      console.error("Foto não copiada ao duplicar produto", { from: img.path, error: cErr.message });
      continue;
    }
    await supabase.storage.from("product-images").copy(thumbPath(img.path), thumbPath(path)); // sem miniatura, a loja usa a foto
    await supabase.from("product_images").insert({ store_id: store.id, product_id: copy.id, path, position: img.position });
  }

  revalidateProduct();
  redirect(`/painel/produtos/${copy.id}?copiado=1`);
}

// ---------------------------------------------------------------- Variações

// Variação como o editor mostra (preços como texto do formulário).
export type VariantRow = {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  compareAt: string;
  stock: number;
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  active: boolean;
};

export type VariantsState = (FormState & { variants?: VariantRow[] }) | null;

export type VariantInput = {
  id: string | null; // null = nova
  name: string;
  sku: string;
  price: string; // "79,90"
  compareAt: string;
  stock: number;
  stockOriginal: number | null; // estoque quando a página foi aberta (controle de concorrência)
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  active: boolean;
};

export async function saveVariants(productId: string, input: VariantInput[]): Promise<VariantsState> {
  const { supabase, store } = await requireStore();
  if (!isUuid(productId)) return { error: "Produto não encontrado." };
  if (!Array.isArray(input) || input.length === 0) return { error: "O produto precisa de pelo menos uma variação." };
  if (input.length > 100) return { error: "Máximo de 100 variações por produto." };

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!product) return { error: "Produto não encontrado." };

  const names = new Set<string>();
  const rows = [];
  for (const [i, v] of input.entries()) {
    const line = `Variação ${i + 1}`;
    const name = String(v.name ?? "").trim().replace(/\s+/g, " ");
    if (!name || name.length > 60) return { error: `${line}: informe um nome (até 60 caracteres).` };
    if (names.has(name.toLowerCase())) return { error: `Há duas variações chamadas "${name}".` };
    names.add(name.toLowerCase());

    const price = parseBRL(String(v.price ?? ""));
    if (price === null) return { error: `${name}: preço inválido.` };
    const compareAt = String(v.compareAt ?? "").trim() ? parseBRL(String(v.compareAt)) : null;
    if (String(v.compareAt ?? "").trim() && compareAt === null) return { error: `${name}: preço "de" inválido.` };
    if (compareAt !== null && compareAt <= price) return { error: `${name}: o preço "de" deve ser maior que o preço.` };

    const stock = Number(v.stock);
    const weight = Number(v.weightG);
    const dims = [Number(v.heightCm), Number(v.widthCm), Number(v.lengthCm)];
    if (!Number.isInteger(stock) || stock < 0) return { error: `${name}: estoque inválido.` };
    if (!Number.isInteger(weight) || weight <= 0 || weight > 30000) return { error: `${name}: peso inválido (gramas, até 30 kg).` };
    if (dims.some((d) => !Number.isFinite(d) || d <= 0 || d > 200)) return { error: `${name}: medidas inválidas (cm, até 200).` };
    if (v.id !== null && !isUuid(String(v.id))) return { error: `${name}: variação inválida.` };

    rows.push({
      id: v.id,
      stockOriginal: v.stockOriginal,
      fields: {
        name,
        sku: String(v.sku ?? "").trim() || null,
        price_cents: price,
        compare_at_cents: compareAt,
        weight_g: weight,
        height_cm: Math.round(dims[0] * 10) / 10,
        width_cm: Math.round(dims[1] * 10) / 10,
        length_cm: Math.round(dims[2] * 10) / 10,
        active: !!v.active,
        position: i,
      },
      stock,
    });
  }

  const { data: existing } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("store_id", store.id);
  const existingIds = new Set((existing ?? []).map((v) => v.id as string));
  if (rows.some((r) => r.id && !existingIds.has(r.id))) return { error: "Recarregue a página: as variações mudaram." };

  // Remove as que saíram da lista. Pedidos antigos mantêm nome e preço copiados.
  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const removed = [...existingIds].filter((id) => !keep.has(id));
  if (removed.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", removed).eq("store_id", store.id);
    if (error) return { error: "Não foi possível remover variações." };
  }

  const stockConflicts: string[] = [];
  for (const r of rows) {
    if (!r.id) {
      const { error } = await supabase
        .from("product_variants")
        .insert({ ...r.fields, stock: r.stock, store_id: store.id, product_id: productId });
      if (error) return { error: `Não foi possível criar "${r.fields.name}".` };
      continue;
    }

    const { error } = await supabase.from("product_variants").update(r.fields).eq("id", r.id).eq("store_id", store.id);
    if (error) return { error: `Não foi possível salvar "${r.fields.name}".` };

    // Estoque só é gravado se o lojista mudou, e só se ninguém (uma venda) mexeu nele desde que a página abriu.
    if (r.stockOriginal !== null && r.stock !== r.stockOriginal) {
      const { data } = await supabase
        .from("product_variants")
        .update({ stock: r.stock })
        .eq("id", r.id)
        .eq("store_id", store.id)
        .eq("stock", r.stockOriginal)
        .select("id");
      if (!data?.length) stockConflicts.push(r.fields.name);
    }
  }

  revalidateProduct(productId);
  // Estoque reposto: quem pediu "avise-me" recebe o e-mail (depois da resposta).
  after(() => notifyBackInStock(store.id));
  const variants = await loadVariants(supabase, store.id, productId);
  if (stockConflicts.length) {
    return {
      variants,
      error: `O estoque de ${stockConflicts.join(", ")} mudou enquanto você editava (provavelmente uma venda). O valor atual já está na tela; ajuste e salve de novo.`,
    };
  }
  return { variants, ok: "Variações salvas." };
}

// Variações no formato do editor (preços como texto do formulário).
async function loadVariants(
  supabase: Awaited<ReturnType<typeof requireStore>>["supabase"],
  storeId: string,
  productId: string,
): Promise<VariantRow[]> {
  const { data } = await supabase
    .from("product_variants")
    .select("id, name, sku, price_cents, compare_at_cents, stock, weight_g, height_cm, width_cm, length_cm, active")
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .order("position");
  return (data ?? []).map((v) => ({
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
  }));
}

// ---------------------------------------------------------------- Imagens

// O navegador envia o arquivo direto ao Storage (políticas por pasta <store_id>/...);
// aqui só registramos a imagem, conferindo que o caminho é da loja e do produto.
export async function addImage(productId: string, path: string): Promise<FormState> {
  const { supabase, store } = await requireStore();
  if (!isUuid(productId)) return { error: "Produto não encontrado." };
  const prefix = `${store.id}/${productId}/`;
  if (!path.startsWith(prefix) || !IMAGE_EXT.test(path) || path.includes("..")) return { error: "Arquivo inválido." };

  const { data: last } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .eq("store_id", store.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("product_images").insert({
    store_id: store.id,
    product_id: productId,
    path,
    position: (last?.position ?? -1) + 1,
  });
  if (error) return { error: "Não foi possível salvar a imagem." };

  revalidateProduct(productId);
  return { ok: "Imagem adicionada." };
}

export async function removeImage(imageId: string): Promise<FormState> {
  const { supabase, store } = await requireStore();
  if (!isUuid(imageId)) return { error: "Imagem não encontrada." };

  const { data: image } = await supabase
    .from("product_images")
    .select("id, path, product_id")
    .eq("id", imageId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!image) return { error: "Imagem não encontrada." };

  const { error } = await supabase.from("product_images").delete().eq("id", image.id).eq("store_id", store.id);
  if (error) return { error: "Não foi possível remover a imagem." };
  await removeFiles(supabase, [image.path]);

  revalidateProduct(image.product_id);
  return { ok: "Imagem removida." };
}

export async function moveImage(imageId: string, direction: "up" | "down"): Promise<FormState> {
  const { supabase, store } = await requireStore();
  if (!isUuid(imageId)) return { error: "Imagem não encontrada." };

  const { data: image } = await supabase
    .from("product_images")
    .select("product_id")
    .eq("id", imageId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!image) return { error: "Imagem não encontrada." };

  const { data: all } = await supabase
    .from("product_images")
    .select("id, position")
    .eq("product_id", image.product_id)
    .eq("store_id", store.id)
    .order("position")
    .order("id");
  const list = (all ?? []) as { id: string; position: number }[];
  const index = list.findIndex((i) => i.id === imageId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return null;

  // Reescreve as posições em sequência (corrige também posições repetidas).
  [list[index], list[target]] = [list[target], list[index]];
  for (const [position, img] of list.entries()) {
    if (img.position !== position) {
      await supabase.from("product_images").update({ position }).eq("id", img.id).eq("store_id", store.id);
    }
  }

  revalidateProduct(image.product_id);
  return null;
}
