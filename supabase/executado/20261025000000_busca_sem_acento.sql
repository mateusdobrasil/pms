-- Busca de produtos sem diferenciar acentos nem maiúsculas: "acai" acha "Açaí".
-- products.search_name guarda o nome normalizado (sem acento, minúsculo), atualizado sozinho pelo banco.
create extension if not exists unaccent with schema extensions;

-- unaccent não é imutável (depende do dicionário); com o dicionário fixo, podemos marcar como imutável
-- e usar em coluna gerada.
create or replace function public.search_normalize(t text) returns text
  language sql immutable parallel safe set search_path = ''
  as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

alter table public.products
  add column if not exists search_name text generated always as (public.search_normalize(name)) stored;
