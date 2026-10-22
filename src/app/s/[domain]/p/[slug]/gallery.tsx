"use client";

import { useState } from "react";
import { NoPhoto } from "../../no-photo";
import { ThumbImage } from "@/lib/thumb-image";

export function Gallery({ name, images }: { name: string; images: { url: string; path: string; alt: string | null }[] }) {
  const [index, setIndex] = useState(0);
  const current = images[index];

  return (
    <div className="space-y-3">
      <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={current.alt ?? name} className="h-full w-full object-cover" />
        ) : (
          <NoPhoto />
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === index ? "" : "border-transparent opacity-70 hover:opacity-100"}`}
                style={i === index ? { borderColor: "var(--brand)" } : undefined}
                aria-label={`Foto ${i + 1}`}
              >
                <ThumbImage path={img.path} alt="" lazy className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
