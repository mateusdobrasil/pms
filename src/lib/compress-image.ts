// Reduz a foto no navegador antes do envio: lado maior até maxSide px, em WebP.
// Foto de celular (3 a 12 MB) vira algo perto de 200 a 400 KB: a loja carrega rápido e o Storage agradece.
// Se o navegador não conseguir (formato desconhecido, sem suporte a WebP), devolve o arquivo original.

export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024; // aceito na entrada; o bucket só recebe o arquivo já reduzido (até 5 MB)

export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  try {
    // imageOrientation: respeita a rotação gravada pela câmera (EXIF).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // Safari antigo não gera WebP (devolve PNG): nesse caso, ou se não ficou menor, mantém o original.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}
