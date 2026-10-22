// Reduz a foto no navegador antes do envio: lado maior até maxSide px, em WebP.
// Foto de celular (3 a 12 MB) vira algo perto de 200 a 400 KB: a loja carrega rápido e o Storage agradece.
// Se o navegador não conseguir (formato desconhecido), devolve o arquivo original.

export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024; // aceito na entrada; o bucket só recebe o arquivo já reduzido (até 5 MB)

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Desenha a imagem no tamanho pedido. crop: recorta o centro em quadrado (miniatura da grade).
async function draw(file: File, maxSide: number, { crop = false, background }: { crop?: boolean; background?: string } = {}) {
  // imageOrientation: respeita a rotação gravada pela câmera (EXIF).
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = crop ? Math.min(bitmap.width, bitmap.height) : Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, maxSide / side);
  const sw = crop ? side : bitmap.width;
  const sh = crop ? side : bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  try {
    const canvas = await draw(file, maxSide);
    let blob = await encode(canvas, "image/webp", quality);
    // Safari (iPhone) não gera WebP (devolve PNG): foto JPG é reduzida em JPEG mesmo.
    if (blob?.type !== "image/webp" && file.type === "image/jpeg") blob = await encode(canvas, "image/jpeg", quality);
    if (!blob || !["image/webp", "image/jpeg"].includes(blob.type) || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
  } catch {
    return file;
  }
}

// Miniatura da grade de produtos: quadrado central de até 600 px, sempre JPEG (todo navegador gera),
// com fundo branco no lugar da transparência. Fica perto de 50 KB.
export async function makeThumbnail(file: File, side = 600): Promise<Blob | null> {
  try {
    const blob = await encode(await draw(file, side, { crop: true, background: "#ffffff" }), "image/jpeg", 0.8);
    return blob?.type === "image/jpeg" ? blob : null;
  } catch {
    return null;
  }
}
