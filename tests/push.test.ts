import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "@/lib/push";

describe("endereço de push do navegador", () => {
  it("aceita os serviços de push dos navegadores", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:APA91b")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx2")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAA")).toBe(true);
    expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("recusa qualquer outro endereço (o servidor faz POST nele)", () => {
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://evil.com/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isPushEndpoint("https://xpush.apple.com/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpoint("não é url")).toBe(false);
  });
});
