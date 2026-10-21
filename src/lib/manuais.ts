import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Manuais em docs/manuais/*.html (fonte editável). Incluídos no deploy por outputFileTracingIncludes (next.config.ts).
export type Manual = "manual-lojista" | "manual-operacao";

const MERMAID = `<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>
  // O script fica no fim da página: o diagrama já está no HTML, então desenha direto
  // (sem esperar o "load", que pode demorar por causa das fontes externas).
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
  mermaid.run({ querySelector: "pre.mermaid" });
</script>`;

export async function manualResponse(name: Manual) {
  const content = await readFile(path.join(process.cwd(), "docs", "manuais", `${name}.html`), "utf8");
  // Os arquivos são o "corpo" da página; aqui vira um documento completo.
  // data-theme="light": acompanha o painel, que é claro.
  const html = `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<link rel="icon" href="/brand/icon-96.png">
</head>
<body>
${content}
${name === "manual-operacao" ? MERMAID : ""}
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
