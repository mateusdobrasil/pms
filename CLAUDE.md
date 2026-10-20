# PMS app — plataforma de lojas virtuais (multi-tenant)

Lojas virtuais prontas para pequenos lojistas brasileiros, vendidas com taxa de implantação + mensalidade.
Um único app Next.js atende todas as lojas; cada loja é identificada pelo domínio.

## Stack
- Next.js 16 (App Router, TypeScript, Tailwind 4) na Vercel. `cacheComponents` desligado: usamos o modelo de cache anterior (`revalidate`, `fetch`). Antes de usar uma API do Next, consulte `node_modules/next/dist/docs/`.
- Supabase: Postgres + RLS, Auth, Storage
- Pagamento: Mercado Pago (Payments API `/v1/payments`; cartão via Card Payment Brick) — Pix e cartão. Credenciais por loja em `store_secrets`.
- Frete: Melhor Envio + retirada local
- E-mail transacional: Resend

## Arquitetura
- `src/proxy.ts` (antigo middleware) reescreve `loja.com.br/x` → `/s/loja.com.br/x`. Domínios em `NEXT_PUBLIC_ROOT_DOMAINS` servem o painel/site da plataforma.
- Vitrine em `src/app/s/[domain]/...`. Painel do lojista e super-admin ficam no domínio raiz (`/painel`, `/admin`).
- Banco: Supabase na nuvem; SQL rodado à mão no SQL Editor, em ordem de nome.
  - `supabase/migrations/`: SQL novo, ainda NÃO executado. Todo SQL novo vai aqui, com prefixo de data (`AAAAMMDDHHMMSS_nome.sql`).
  - `supabase/executado/`: SQL já rodado no banco (o usuário move para cá depois de rodar). Nunca editar um arquivo daqui; mudanças vão num SQL novo em `migrations/`.

## Regras do projeto (não quebrar)
- Toda tabela tem `store_id`, e toda consulta da vitrine filtra por ele.
- Valores monetários sempre em centavos (integer). Formatar só na exibição (`formatBRL`).
- Pedidos, itens e pagamentos são criados APENAS no servidor com `createAdminClient()`. Nunca confiar em preço vindo do cliente: recalcular a partir de `product_variants`.
- Estoque só baixa na confirmação do pagamento (`confirm_order_payment`), nunca na criação do pedido.
- Webhooks: idempotentes (`webhook_events`) e sempre consultando o gateway em vez de confiar no payload.
- Credenciais de gateway/frete ficam em `store_secrets` (sem policy; só service role).
- Leitura pública da vitrine usa `createPublicClient()`; painel usa `createSupabaseServerClient()`.
- Textos de interface em português do Brasil.
- E-mails só via `src/lib/email.ts`, disparados com `after()` e travados pelas colunas `orders.notified_*` (nunca enviar duas vezes).
- Super-admin (`/admin`) usa `requireAdmin()` + service role; quem não é admin recebe 404.

## Escopo da v1
Vitrine: home, categoria, busca simples, produto com variações e estoque, carrinho, checkout sem cadastro (nome, CPF, e-mail, telefone, endereço via ViaCEP), frete Melhor Envio + retirada, Pix e cartão, confirmação, e-mail de pedido, acompanhamento por link (`orders.public_token`), botão WhatsApp, SEO básico (metadata, sitemap, OG).
Painel: login, CRUD de produtos/categorias/variações/estoque com upload de imagens, lista de pedidos com status e rastreio (dispara e-mail), configurações da loja, resumo de vendas do dia/mês.
Super-admin: criar loja, vincular domínio, ativar/suspender.

## Fora da v1 (não implementar sem pedir)
Cupons, avaliações, carrinho abandonado, conta de cliente, marketplaces, ERP, NF-e, multi-gateway.

## Ordem de trabalho
1. Checkout → criação do pedido no servidor → pagamento Pix/cartão → webhook (o mais arriscado primeiro)
2. Painel de pedidos
3. Painel de produtos e imagens
4. Páginas da vitrine (produto, categoria, carrinho, busca)
5. Frete Melhor Envio
6. E-mails, SEO, super-admin

## Comandos
- `npm run dev` → loja de teste em http://loja-teste.localhost:3000
- SQL: rodar cada arquivo de `supabase/migrations/` no SQL Editor do Supabase e mover para `supabase/executado/`
- `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` (precisa de `npx supabase login`)
