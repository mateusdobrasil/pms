"use client";

import { productImageUrl, productThumbUrl } from "@/lib/images";

// Miniatura da foto; se ela não existir (foto enviada antes das miniaturas), mostra a foto original.
export function ThumbImage({ path, alt, className, lazy }: { path: string; alt: string; className?: string; lazy?: boolean }) {
  const full = productImageUrl(path);
  const fallback = (img: HTMLImageElement) => {
    if (img.src !== full) img.src = full;
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={productThumbUrl(path)}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      className={className}
      onError={(e) => fallback(e.currentTarget)}
      // O erro pode acontecer antes da hidratação (o onError ainda não existia): confere ao montar.
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) fallback(img);
      }}
    />
  );
}
