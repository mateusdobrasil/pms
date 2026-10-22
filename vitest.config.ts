import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes de unidade da lógica de dinheiro, pedido e pagamento (sem banco nem rede).
// "server-only" é trocado por um módulo vazio: fora do Next ele lançaria erro.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
