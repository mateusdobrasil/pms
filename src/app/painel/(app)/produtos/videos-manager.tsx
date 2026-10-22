"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, MAX_VIDEOS, productVideoUrl } from "@/lib/images";
import { addVideo, removeVideo } from "./actions";

const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

// Abre o vídeo no navegador para ler a duração e conferir se a imagem toca
// (vídeo HEVC do iPhone, por exemplo, abre só com som no Chrome: videoWidth fica 0).
function inspect(file: File): Promise<{ seconds: number; playable: boolean } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (result: { seconds: number; playable: boolean } | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done({ seconds: video.duration, playable: video.videoWidth > 0 });
    video.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    video.src = url;
  });
}

export function VideosManager({
  storeId,
  productId,
  videos,
}: {
  storeId: string;
  productId: string;
  videos: { id: string; path: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = videos.length >= MAX_VIDEOS;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const fail = (message: string) => {
      setError(message);
      if (inputRef.current) inputRef.current.value = "";
    };

    const ext = TYPES[file.type];
    if (!ext) return fail("Use um vídeo MP4, MOV ou WebM.");
    if (file.size > MAX_VIDEO_BYTES) return fail("Vídeo muito grande: máximo de 50 MB. Encurte ou grave em resolução menor.");
    const info = await inspect(file);
    if (!info) return fail("Não foi possível abrir este vídeo. Tente exportá-lo em MP4.");
    if (!info.playable) {
      return fail("Este vídeo não toca em todos os navegadores (formato HEVC). No iPhone, use Ajustes → Câmera → Formatos → Mais Compatível, ou exporte em MP4.");
    }
    if (info.seconds > MAX_VIDEO_SECONDS + 1) return fail(`Vídeo com ${Math.round(info.seconds)} s: o máximo é ${MAX_VIDEO_SECONDS} s.`);

    setUploading(true);
    const supabase = createSupabaseBrowserClient();
    const path = `${storeId}/${productId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-videos")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (upErr) {
      setUploading(false);
      return fail("Falha no envio do vídeo. Confira a conexão e tente de novo.");
    }
    const result = await addVideo(productId, path);
    if (result?.error) {
      await supabase.storage.from("product-videos").remove([path]);
      setUploading(false);
      return fail(result.error);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Vídeos</h2>
        <span className="text-xs text-emerald-700">✓ Salvos automaticamente ao enviar</span>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum vídeo. Um vídeo curto mostrando o produto em uso ajuda o cliente a decidir. Ele aparece na loja depois das fotos.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {videos.map((v) => (
            <li key={v.id} className="space-y-1">
              <video
                src={`${productVideoUrl(v.path)}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                controls
                className="aspect-square w-full rounded bg-neutral-900 object-cover"
              />
              <div className="flex justify-end text-sm">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    confirm("Remover este vídeo?") &&
                    startTransition(async () => {
                      await removeVideo(v.id);
                      router.refresh();
                    })
                  }
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
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="hidden"
          id="product-video-input"
          disabled={full || uploading}
        />
        <label
          htmlFor="product-video-input"
          className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${uploading || full ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? "Enviando vídeo… pode levar alguns minutos" : "+ Adicionar vídeo"}
        </label>
        <span className="text-xs text-neutral-500">
          {full
            ? `Limite de ${MAX_VIDEOS} vídeos atingido.`
            : `MP4 ou MOV, até ${MAX_VIDEO_SECONDS} segundos e 50 MB. Até ${MAX_VIDEOS} por produto.`}
        </span>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
