import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emailStatusLabel, nextStatus, verifyResendSignature } from "@/lib/resend-webhook";

const secret = "whsec_" + Buffer.from("segredo-de-teste-123").toString("base64");
const sign = (id: string, ts: string, body: string) =>
  "v1," + createHmac("sha256", Buffer.from("segredo-de-teste-123")).update(`${id}.${ts}.${body}`).digest("base64");

describe("verifyResendSignature", () => {
  const body = '{"type":"email.bounced"}';
  const ts = "1792700000";
  const now = 1792700000 * 1000;

  it("aceita a assinatura certa (inclusive entre várias)", () => {
    expect(verifyResendSignature({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, secret, now })).toBe(true);
    expect(verifyResendSignature({ id: "msg_1", timestamp: ts, signature: `v1,outra ${sign("msg_1", ts, body)}`, body, secret, now })).toBe(true);
  });

  it("recusa corpo alterado, segredo errado, cabeçalho faltando e aviso antigo", () => {
    expect(verifyResendSignature({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body: body + " ", secret, now })).toBe(false);
    expect(verifyResendSignature({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, secret: "whsec_" + Buffer.from("x").toString("base64"), now })).toBe(false);
    expect(verifyResendSignature({ id: null, timestamp: ts, signature: sign("msg_1", ts, body), body, secret, now })).toBe(false);
    expect(verifyResendSignature({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, secret, now: now + 10 * 60 * 1000 })).toBe(false);
  });
});

describe("status", () => {
  it("só avança", () => {
    expect(nextStatus("sent", "delivered")).toBe("delivered");
    expect(nextStatus("delivered", "delayed")).toBe("delivered");
    expect(nextStatus("delivered", "complained")).toBe("complained");
    expect(nextStatus("bounced", "delivered")).toBe("bounced");
  });

  it("textos", () => {
    expect(emailStatusLabel("bounced", "caixa inexistente")).toBe("voltou (caixa inexistente)");
    expect(emailStatusLabel("complained")).toBe("foi marcado como spam pelo destinatário");
  });
});
