"use client";

import { useState } from "react";
import { NoPhoto } from "../../no-photo";

export type Media = { type: "image" | "video"; url: string; alt: string | null };

// Fotos e vídeos do produto. Vídeo toca com controles, sem som até o cliente ligar,
// e só começa a baixar quando é escolhido (preload="metadata").
export function Gallery({ name, media }: { name: string; media: Media[] }) {
  const [index, setIndex] = useState(0);
  const current = media[index];

  return (
    <div className="space-y-3">
      <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200">
        {!current ? (
          <NoPhoto />
        ) : current.type === "video" ? (
          <video
            key={current.url}
            src={current.url}
            controls
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-contain"
            aria-label={`Vídeo de ${name}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={current.alt ?? name} className="h-full w-full object-cover" />
        )}
      </div>
      {media.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {media.map((m, i) => (
            <li key={m.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === index ? "" : "border-transparent opacity-70 hover:opacity-100"}`}
                style={i === index ? { borderColor: "var(--brand)" } : undefined}
                aria-label={m.type === "video" ? `Vídeo ${i + 1}` : `Foto ${i + 1}`}
              >
                {m.type === "video" ? (
                  <>
                    <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full bg-neutral-900 object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/25" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white drop-shadow">
                        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                      </svg>
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
