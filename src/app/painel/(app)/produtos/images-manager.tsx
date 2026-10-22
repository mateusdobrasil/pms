"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { thumbPath } from "@/lib/images";
import { ThumbImage } from "@/lib/thumb-image";
import { MAX_ORIGINAL_BYTES, compressImage, makeThumbnail } from "@/lib/compress-image";
import { addImage, moveImage, removeImage } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function ImagesManager({
  storeId,
  productId,
  images,
}: {
  storeId: string;
  productId: string;
  images: { id: string; path: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const supabase = createSupabaseBrowserClient();
    const problems: string[] = [];

    for (const original of Array.from(files)) {
      if (!TYPES[original.type]) {
        problems.push(`${original.name}: use JPG, PNG ou WebP.`);
        continue;
      }
      if (original.size > MAX_ORIGINAL_BYTES) {
        problems.push(`${original.name}: arquivo muito grande (máximo de 25 MB).`);
        continue;
      }
      // Reduz no navegador (até 1600 px, WebP) antes de enviar.
      const file = await compressImage(original);
      const ext = TYPES[file.type];
      if (file.size > MAX_BYTES) {
        problems.push(`${original.name}: não foi possível reduzir para menos de 5 MB.`);
        continue;
      }
      // Pasta <store_id>/... é exigida pelas políticas do Storage.
      const path = `${storeId}/${productId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (upErr) {
        problems.push(`${file.name}: falha no envio.`);
        continue;
      }
      // Miniatura para a grade da loja. Se falhar, a loja usa a foto inteira no lugar.
      const thumb = await makeThumbnail(file);
      if (thumb) {
        await supabase.storage
          .from("product-images")
          .upload(thumbPath(path), thumb, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
      }
      const result = await addImage(productId, path);
      if (result?.error) {
        await supabase.storage.from("product-images").remove([path, thumbPath(path)]);
        problems.push(`${file.name}: ${result.error}`);
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (problems.length) setError(problems.join(" "));
    router.refresh();
  }

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Fotos</h2>
        <span className="text-xs text-emerald-700">✓ Salvas automaticamente ao enviar</span>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma foto ainda. A primeira foto é a capa do produto.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="space-y-1">
              <div className="relative aspect-square overflow-hidden rounded bg-neutral-100">
                <ThumbImage path={img.path} alt="" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">Capa</span>}
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex gap-2">
                  <button type="button" disabled={pending || i === 0} onClick={() => run(() => moveImage(img.id, "up"))} className="disabled:opacity-30" aria-label="Mover para a esquerda">←</button>
                  <button type="button" disabled={pending || i === images.length - 1} onClick={() => run(() => moveImage(img.id, "down"))} className="disabled:opacity-30" aria-label="Mover para a direita">→</button>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => confirm("Remover esta foto?") && run(() => removeImage(img.id))}
                  className="text-red-700 disabled:opacity-30"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
          id="product-image-input"
        />
        <label
          htmlFor="product-image-input"
          className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? "Reduzindo e enviando…" : "+ Adicionar fotos"}
        </label>
        <span className="text-xs text-neutral-500">JPG, PNG ou WebP. As fotos são reduzidas automaticamente para carregar rápido na loja.</span>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
