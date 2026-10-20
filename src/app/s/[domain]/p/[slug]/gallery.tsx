"use client";

import { useState } from "react";

export function Gallery({ name, images }: { name: string; images: { url: string; alt: string | null }[] }) {
  const [index, setIndex] = useState(0);
  const current = images[index];

  return (
    <div className="space-y-3">
      <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={current.alt ?? name} className="h-full w-full object-cover" />
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`block aspect-square w-full overflow-hidden rounded border-2 ${i === index ? "border-neutral-900" : "border-transparent"}`}
                aria-label={`Foto ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
