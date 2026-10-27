-- Página de links para a bio do Instagram (loja.com.br/links): frase curta e links extras escolhidos pelo
-- lojista em Painel → Divulgar. Os botões da loja (produtos, agendar, pacotes, WhatsApp) entram sozinhos.
alter table public.stores
  add column if not exists bio_text  text check (char_length(bio_text) <= 160),
  add column if not exists bio_links jsonb not null default '[]'::jsonb; -- [{"title": "...", "url": "https://..."}], até 6

grant update (bio_text, bio_links) on public.stores to authenticated;
