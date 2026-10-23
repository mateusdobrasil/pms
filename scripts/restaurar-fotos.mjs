// Restaura do backup (Vercel Blob) as fotos e logos que sumiram do bucket product-images do Supabase.
// Só envia o que falta: nunca sobrescreve um arquivo que ainda existe.
//
// Uso (na pasta do projeto, com SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL e BLOB_READ_WRITE_TOKEN no .env.local):
//   node --env-file=.env.local scripts/restaurar-fotos.mjs            → mostra o que seria restaurado
//   node --env-file=.env.local scripts/restaurar-fotos.mjs --aplicar  → restaura
import { createClient } from "@supabase/supabase-js";
import { get, list } from "@vercel/blob";

const BUCKET = "product-images";
const PREFIX = `backup/${BUCKET}/`; // igual a src/lib/photo-backup.ts
const apply = process.argv.includes("--aplicar");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Falta BLOB_READ_WRITE_TOKEN (Vercel → Storage → o Blob do projeto → .env.local).");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bucket = db.storage.from(BUCKET);
const publicUrl = (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

let cursor;
let total = 0;
let missing = 0;
let restored = 0;
do {
  const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
  for (const blob of page.blobs) {
    total++;
    const path = blob.pathname.slice(PREFIX.length);
    const exists = (await fetch(publicUrl(path), { method: "HEAD" })).ok;
    if (exists) continue;
    missing++;
    if (!apply) {
      console.log("faltando:", path);
      continue;
    }
    const file = await get(blob.pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) {
      console.error("não conseguiu ler do backup", path);
      continue;
    }
    const body = Buffer.from(await new Response(file.stream).arrayBuffer());
    const { error } = await bucket.upload(path, body, { contentType: file.blob.contentType, cacheControl: "31536000", upsert: false });
    if (error) console.error("não restaurou", path, error.message);
    else restored++;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

console.log(`No backup: ${total} · faltando no Supabase: ${missing}${apply ? ` · restaurados: ${restored}` : " (rode com --aplicar para restaurar)"}`);
