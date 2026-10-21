export const metadata = { title: "Ajuda · Super-admin · PMS app" };

export default function AdminHelpPage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ajuda</h1>
        <div className="flex flex-wrap gap-4 text-sm font-medium">
          <a href="/admin/manual-operacao" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">
            Manual de Operação em tela cheia ↗
          </a>
          <a href="/painel/manual-lojista" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">
            Manual do Lojista ↗
          </a>
        </div>
      </div>
      <iframe
        src="/admin/manual-operacao"
        title="Manual de Operação"
        className="h-[calc(100vh-11rem)] min-h-[520px] w-full rounded-xl border bg-white shadow-sm"
      />
    </div>
  );
}
