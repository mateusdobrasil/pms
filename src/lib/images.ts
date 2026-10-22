// URL pública de uma imagem do bucket product-images (seguro para usar no navegador).
export function productImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

// Vídeos de demonstração: limites conferidos no painel (o bucket também barra acima de 50 MB).
export const MAX_VIDEOS = 3;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// URL pública de um vídeo do bucket product-videos.
export function productVideoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-videos/${path}`;
}
