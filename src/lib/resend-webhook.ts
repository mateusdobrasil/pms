import { createHmac, timingSafeEqual } from "node:crypto";

// Webhook do Resend (assinado no padrão Svix: cabeçalhos svix-id, svix-timestamp e svix-signature).
// Testado em tests/resend-webhook.test.ts.

export type EmailStatus = "sent" | "delivered" | "delayed" | "bounced" | "complained";

export const STATUS_BY_EVENT: Record<string, EmailStatus> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

// Assinatura: HMAC-SHA256 de "<id>.<timestamp>.<corpo>" com o segredo (whsec_..., em base64).
// Recusa avisos com mais de 5 minutos de diferença (evita reenvio de um aviso antigo).
export function verifyResendSignature(args: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  now?: number;
}) {
  const { id, timestamp, signature, body, secret } = args;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs((args.now ?? Date.now()) / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    const given = Buffer.from(sig ?? "");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// O status só avança: voltou/spam são finais, e "entregue" não volta para "atrasado".
const RANK: Record<EmailStatus, number> = { sent: 0, delayed: 1, delivered: 2, bounced: 3, complained: 3 };
export const nextStatus = (current: EmailStatus, incoming: EmailStatus) => (RANK[incoming] >= RANK[current] ? incoming : current);

// Motivo curto da devolução, em português (o texto do provedor vem longo e em inglês).
const BOUNCE_REASONS: Record<string, string> = {
  Suppressed: "endereço bloqueado por devoluções anteriores",
  OnAccountSuppressionList: "endereço bloqueado por devoluções anteriores",
  MailboxFull: "caixa de entrada cheia",
  MessageTooLarge: "mensagem grande demais para o provedor",
  ContentRejected: "recusado pelo provedor do destinatário",
  AttachmentRejected: "recusado pelo provedor do destinatário",
  NoEmail: "endereço não existe",
};
export function bounceReason(bounce: { type?: string; subType?: string } | null | undefined) {
  if (!bounce) return null;
  if (bounce.subType && BOUNCE_REASONS[bounce.subType]) return BOUNCE_REASONS[bounce.subType];
  if (bounce.type === "Transient") return "falha temporária no provedor do destinatário";
  return "endereço não existe ou foi recusado";
}

export const isProblem = (status: string) => status === "bounced" || status === "complained";

// Texto para o lojista/admin.
export function emailStatusLabel(status: string, detail?: string | null) {
  if (status === "bounced") return `voltou${detail ? ` (${detail})` : ""}`;
  if (status === "complained") return "foi marcado como spam pelo destinatário";
  if (status === "delivered") return "entregue";
  if (status === "delayed") return "com entrega atrasada (o provedor ainda está tentando)";
  return "enviado";
}
