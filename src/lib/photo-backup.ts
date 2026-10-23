import "server-only";
import { list, put } from "@vercel/blob";
import type { createAdminClient } from "@/lib/supabase/admin";
import { productImageUrl } from "@/lib/images";

// Backup das fotos e logos (bucket product-images do Supabase) no Vercel Blob, fora do Supabase:
// o backup diário do banco não cobre o Storage. Cópia incremental (só o que ainda não foi copiado),
// privada, com o mesmo caminho do bucket debaixo de BACKUP_PREFIX. Restauração: scripts/restaurar-fotos.mjs.

type Db = ReturnType<typeof createAdminClient>;

export const BUCKET = "product-images";
export const BACKUP_PREFIX = `backup/${BUCKET}/`;
const PAGE = 1000;
const PARALLEL = 4;

// Todos os arquivos do bucket (o Supabase lista uma pasta por vez; pastas vêm com id null).
async function listBucket(db: Db, folder = ""): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: PAGE, offset });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...(await listBucket(db, path)));
    }
    if (!data || data.length < PAGE) break;
  }
  return files;
}

async function listBackedUp() {
  const done = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor, limit: PAGE });
    for (const b of page.blobs) done.add(b.pathname.slice(BACKUP_PREFIX.length));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return done;
}

// Copia o que falta até o prazo (a rotina continua no dia seguinte se não terminar).
export async function backupPhotos(db: Db, deadline: number) {
  const [files, done] = await Promise.all([listBucket(db), listBackedUp()]);
  const missing = files.filter((f) => !done.has(f));
  let copied = 0;
  const failed: string[] = [];

  for (let i = 0; i < missing.length && Date.now() < deadline; i += PARALLEL) {
    await Promise.all(
      missing.slice(i, i + PARALLEL).map(async (path) => {
        try {
          const res = await fetch(productImageUrl(path), { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await put(`${BACKUP_PREFIX}${path}`, Buffer.from(await res.arrayBuffer()), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true, // uma tentativa anterior pode ter ficado pela metade
            contentType: res.headers.get("content-type") ?? undefined,
          });
          copied++;
        } catch (err) {
          failed.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }
  return { files: files.length, alreadyBackedUp: files.length - missing.length, copied, failed, pending: missing.length - copied - failed.length };
}
