import Image from "next/image";
import Link from "next/link";

// Marca da plataforma (site, login, super-admin). Arquivo-fonte em design/pmsapp_logo.jpg.
export function PlatformBrand({ size = "md" }: { size?: "md" | "lg" }) {
  const height = size === "lg" ? 88 : 52;
  return (
    <Link href="/" className="inline-flex items-center" aria-label="PMS app — início">
      <Image
        src="/brand/logo.png"
        alt="PMS app"
        width={480}
        height={307}
        priority
        style={{ height, width: "auto" }}
      />
    </Link>
  );
}

// Só o símbolo (o "P" com a sacola), para fundos escuros e espaços pequenos.
export function PlatformMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/brand/icon-96.png"
      alt="PMS app"
      width={96}
      height={96}
      className="rounded-lg"
      style={{ width: size, height: size }}
    />
  );
}
