// Marcador para produto sem foto.
export function NoPhoto() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-400">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10 fill-none stroke-current" strokeWidth={1.5}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m21 16-5-5-8 8" />
      </svg>
      <span className="text-xs">Sem foto</span>
    </div>
  );
}
