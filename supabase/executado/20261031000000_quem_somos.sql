-- "Quem somos" da loja: texto livre do lojista, usado na página de Trocas e devoluções.
-- Vazio = a seção mostra só o nome da loja.
alter table public.stores add column if not exists about text;
grant update (about) on public.stores to authenticated;
