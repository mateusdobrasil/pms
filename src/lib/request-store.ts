import "server-only";
import { getStoreByDomain } from "@/lib/store";

// Rotas /api não passam pelo rewrite do middleware: a loja vem do host da requisição, nunca do corpo.
export function getStoreFromRequest(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return getStoreByDomain(host);
}
