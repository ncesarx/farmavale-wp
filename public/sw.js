self.addEventListener("push", (event) => {
  let payload = { title: "Farmavale Central", body: "Novo alerta operacional", href: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, icon: "/farmavale-logo.png", badge: "/farmavale-logo.png",
    tag: payload.notificationId || payload.type || "farmavale", data: { href: payload.href || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const current = windows.find((client) => client.url.startsWith(self.location.origin));
    if (current) { current.navigate(href); return current.focus(); }
    return clients.openWindow(href);
  }));
});