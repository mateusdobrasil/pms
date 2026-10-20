import Link from "next/link";

// Marca da plataforma (usada no site e nas telas de acesso).
export function PlatformBrand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-neutral-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-600 text-sm font-bold text-white">P</span>
      PMS app
    </Link>
  );
}
