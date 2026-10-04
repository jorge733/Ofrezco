// Service worker de notificaciones: el navegador lo mantiene vivo aunque el panel esté cerrado.
// Recibe las notificaciones que manda la Cloud Function (functions/index.js) y las muestra.
// Tiene que estar en la raíz del sitio y llamarse exactamente así.
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAOvR56ulZrHsd9FBJmCmSUYCNBJIAuRKI",
  authDomain: "ofrezco-2583a.firebaseapp.com",
  projectId: "ofrezco-2583a",
  storageBucket: "ofrezco-2583a.firebasestorage.app",
  messagingSenderId: "1099071794710",
  appId: "1:1099071794710:web:d5d50573167825c0c60f37"
});

// Con esto activo, Firebase muestra solo la notificación que trae el mensaje
firebase.messaging();

// Al tocar la notificación, abre (o enfoca) el panel
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL("/panel#bookings-card", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.includes("/panel"));
      return abierta ? abierta.focus() : clients.openWindow(destino);
    })
  );
});
