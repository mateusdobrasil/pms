// Service worker do painel do lojista (escopo /painel): recebe as notificações (Web Push) mesmo com o painel fechado.
// Não guarda nada em cache: o painel sempre precisa de dados atuais.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "PMS app", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "PMS app", {
      body: msg.body || "",
      icon: "/brand/app-192.png",
      badge: "/brand/badge-96.png",
      tag: msg.tag,
      renotify: !!msg.tag,
      data: { url: msg.url || "/painel" },
    }),
  );
});

// Toque na notificação: abre (ou traz para frente) o painel na página do pedido/agendamento.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/painel", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = windows.find((w) => new URL(w.url).pathname.startsWith("/painel"));
      if (panel) {
        await panel.focus();
        return panel.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
