// URL pública de uma imagem do bucket product-images (seguro para usar no navegador).
export function productImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

// Miniatura quadrada (600 px, JPEG) gerada no envio, ao lado da foto: <loja>/<produto>/<id>-thumb.jpg.
// Fotos antigas podem não ter: quem exibe volta para a foto original (ThumbImage).
export function thumbPath(path: string) {
  return path.replace(/\.[^./]+$/, "") + "-thumb.jpg";
}

export function productThumbUrl(path: string) {
  return productImageUrl(thumbPath(path));
}
