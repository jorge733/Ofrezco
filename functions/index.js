// Cloud Function: cada vez que se crea una reserva, manda una notificación push
// a todos los dispositivos donde el dueño activó los avisos en su panel.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const MODALIDADES = { presencial: "🤝 Presencial", videollamada: "💻 Videollamada", llamada: "📞 Llamada" };

exports.avisarReserva = onDocumentCreated("perfiles/{uid}/reservas/{reservaId}", async (event) => {
  const reserva = event.data?.data();
  if (!reserva) return;

  const db = getFirestore();
  const dispositivos = await db.collection(`perfiles/${event.params.uid}/dispositivos`).get();
  if (dispositivos.empty) return; // el dueño no activó las notificaciones

  // "2026-10-08" → "jueves 8 de octubre"
  const fecha = new Date(`${reserva.fecha}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago"
  });
  const partes = [`${reserva.nombre} reservó el ${fecha} a las ${reserva.hora}`];
  if (reserva.modalidad) partes.push(MODALIDADES[reserva.modalidad] || reserva.modalidad);
  if (reserva.servicio) partes.push(reserva.servicio);

  const tokens = dispositivos.docs.map((d) => d.id);
  const respuesta = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: "📅 ¡Nueva reserva!", body: partes.join(" · ") },
    webpush: {
      notification: { icon: "https://serviceplanet.cl/apple-touch-icon.png", tag: event.params.reservaId },
      fcmOptions: { link: "https://serviceplanet.cl/panel" }
    }
  });

  // Borra los dispositivos que ya no sirven (desinstalaron, bloquearon avisos, etc.)
  const borrar = [];
  respuesta.responses.forEach((r, i) => {
    const codigo = r.error?.code || "";
    if (codigo.includes("registration-token-not-registered") || codigo.includes("invalid-registration-token")) {
      borrar.push(dispositivos.docs[i].ref.delete());
    }
  });
  await Promise.all(borrar);
});
