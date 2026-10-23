-- Categoria com produtos não pode ser excluída (antes, os produtos ficavam "sem categoria" sem aviso).
-- "no action" (e não "restrict") confere só no fim do comando: excluir uma loja inteira, que apaga
-- categorias e produtos em cascata, continua funcionando.
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey foreign key (category_id) references public.categories(id) on delete no action;
