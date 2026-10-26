import "server-only";
import { timingSafeEqual } from "node:crypto";

// Rotinas da Vercel (vercel.json → crons): a Vercel chama com "Authorization: Bearer <CRON_SECRET>".
// Sem o segredo configurado, ou com o segredo errado, a rotina não roda (401).
export function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
