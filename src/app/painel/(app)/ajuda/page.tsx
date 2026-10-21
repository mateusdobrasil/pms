export const metadata = { title: "Ajuda · PMS app" };

export default function HelpPage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ajuda</h1>
        <a href="/painel/manual-lojista" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary-700 hover:underline">
          Abrir o manual em tela cheia ↗
        </a>
      </div>
      <iframe
        src="/painel/manual-lojista"
        title="Manual do Lojista"
        className="h-[calc(100vh-13rem)] min-h-[520px] w-full rounded-xl border bg-white shadow-sm"
      />
    </div>
  );
}
