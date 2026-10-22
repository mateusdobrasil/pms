// URL pública de uma imagem do bucket product-images (seguro para usar no navegador).
export function productImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
