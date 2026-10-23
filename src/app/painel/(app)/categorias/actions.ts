"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { slugify } from "@/lib/slug";
import { isUuid } from "@/lib/validation";

export type CategoryState = { error?: string; ok?: string } | null;

function readName(form: FormData) {
  return String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
}

function done(ok: string): CategoryState {
  revalidatePath("/painel/categorias");
  revalidatePath("/painel/produtos");
  return { ok };
}

export async function createCategory(_prev: CategoryState, form: FormData): Promise<CategoryState> {
  const { supabase, store } = await requireStore();
  const name = readName(form);
  if (name.length < 2 || name.length > 60) return { error: "Informe um nome (até 60 caracteres)." };

  const { data: last } = await supabase
    .from("categories")
    .select("position")
    .eq("store_id", store.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("categories")
    .insert({ store_id: store.id, name, slug: slugify(name), position: (last?.position ?? -1) + 1 });
  if (error) return { error: error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível criar." };
  return done(`Categoria "${name}" criada.`);
}

export async function renameCategory(_prev: CategoryState, form: FormData): Promise<CategoryState> {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  const name = readName(form);
  if (!isUuid(id)) return { error: "Categoria não encontrada." };
  if (name.length < 2 || name.length > 60) return { error: "Informe um nome (até 60 caracteres)." };

  // O slug acompanha o nome: muda o endereço da categoria na loja.
  const { data, error } = await supabase
    .from("categories")
    .update({ name, slug: slugify(name) })
    .eq("id", id)
    .eq("store_id", store.id)
    .select("id");
  if (error) return { error: error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível salvar." };
  if (!data?.length) return { error: "Categoria não encontrada." };
  return done("Categoria salva.");
}

// Só exclui categoria vazia: com produtos (visíveis ou ocultos), recusa e explica (o banco também recusa).
export async function deleteCategory(_prev: CategoryState, form: FormData): Promise<CategoryState> {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Categoria não encontrada." };
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("category_id", id);
  if (count) return { error: inUseMessage(count) };
  const { error } = await supabase.from("categories").delete().eq("id", id).eq("store_id", store.id);
  if (error) return { error: error.code === "23503" ? inUseMessage(1) : "Não foi possível excluir." };
  return done("Categoria excluída.");
}

const inUseMessage = (n: number) =>
  `Esta categoria tem ${n === 1 ? "1 produto" : `${n} produtos`}. Mude a categoria ${n === 1 ? "dele" : "deles"} (em Produtos) antes de excluir.`;

export async function moveCategory(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  const direction = form.get("direction") === "up" ? "up" : "down";
  if (!isUuid(id)) return;

  const { data } = await supabase
    .from("categories")
    .select("id, position")
    .eq("store_id", store.id)
    .order("position")
    .order("name");
  const list = (data ?? []) as { id: string; position: number }[];
  const index = list.findIndex((c) => c.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return;

  [list[index], list[target]] = [list[target], list[index]];
  for (const [position, c] of list.entries()) {
    if (c.position !== position) {
      await supabase.from("categories").update({ position }).eq("id", c.id).eq("store_id", store.id);
    }
  }
  done("Ordem atualizada.");
}
