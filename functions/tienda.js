// Cloud Functions de la tienda: compras de pago único con Flow.
//   compras/{id}    cada compra: dueño, función, monto y estado (solo estas funciones escriben)
//   publico/{uid}   funciones activas de cada negocio; la página pública lo lee para saber qué mostrar
//
// La función se activa solo cuando Flow confirma el pago consultando su API. Nunca por lo que diga el navegador.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const { CATALOGO } = require("./tienda/catalogo");
const { crearProveedor } = require("./tienda/flow");
const { decidirCompra, compraVencida } = require("./tienda/compras");

const REGION = "southamerica-west1";
// Las tareas programadas de Google (Cloud Scheduler) no existen en Santiago: esta corre en Sao Paulo
const REGION_PROGRAMADAS = "southamerica-east1";
const SITIO = process.env.SITIO || "https://www.serviceplanet.cl";
const BASE_FUNCIONES = `https://${REGION}-${process.env.GCLOUD_PROJECT || "ofrezco-2583a"}.cloudfunctions.net`;
const UNA_HORA_EN_SEGUNDOS = 60 * 60;

const db = () => getFirestore();

// Aplica en una transacción lo que informó Flow. Devuelve el estado con que queda la compra.
async function aplicarPago(compraId, pago) {
  const compraRef = db().doc(`compras/${compraId}`);
  return db().runTransaction(async (t) => {
    const snap = await t.get(compraRef);
    if (!snap.exists) throw new Error(`Flow informó una compra que no existe: ${compraId}`);
    const compra = snap.data();
    const publicoRef = db().doc(`publico/${compra.uid}`);
    const publico = await t.get(publicoRef);
    const decision = decidirCompra({ compra, pago, funcionesDelNegocio: publico.data()?.funciones || [] });

    if (decision.accion === "activar") {
      t.update(compraRef, { estado: "pagado", pagado: Date.now(), flowOrder: pago.flowOrder });
      t.set(publicoRef, { funciones: FieldValue.arrayUnion(compra.funcion) }, { merge: true });
      return "pagado";
    }
    if (decision.accion === "marcar") {
      t.update(compraRef, { estado: decision.estado, flowOrder: pago.flowOrder, ...(decision.motivo ? { motivo: decision.motivo } : {}) });
      if (decision.motivo) console.error(`Compra ${compraId}: ${decision.motivo}. Revisar en Flow.`);
      return decision.estado;
    }
    return compra.estado;
  });
}

// El panel llama aquí al apretar "Comprar". Devuelve la dirección de Flow donde se paga.
exports.comprarFuncion = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const uid = request.auth.uid;
  const funcion = String(request.data?.funcion || "");
  const producto = Object.hasOwn(CATALOGO, funcion) ? CATALOGO[funcion] : null;
  if (!producto?.disponible) throw new HttpsError("failed-precondition", "Esta función todavía no está disponible.");

  const [perfil, publico] = await Promise.all([db().doc(`perfiles/${uid}`).get(), db().doc(`publico/${uid}`).get()]);
  if (!perfil.exists) throw new HttpsError("failed-precondition", "Primero crea tu página y después vuelve a la tienda.");
  if ((publico.data()?.funciones || []).includes(funcion)) throw new HttpsError("already-exists", "Ya tienes esta función activa.");

  let proveedor;
  try {
    proveedor = crearProveedor();
  } catch (error) {
    console.error(error.message);
    throw new HttpsError("unavailable", "Las compras todavía no están activas. Inténtalo más tarde.");
  }

  // Si dejó un pago anterior abierto que sí se completó, se activa en vez de cobrarle otra vez
  const abiertas = await db().collection("compras").where("uid", "==", uid).where("funcion", "==", funcion).where("estado", "==", "pendiente").get();
  for (const compra of abiertas.docs) {
    try {
      const pago = await proveedor.pagoPorOrden(compra.id);
      if (pago.estado !== "no_existe" && await aplicarPago(compra.id, pago) === "pagado") return { yaPagada: true };
    } catch (error) {
      console.error(error);
      throw new HttpsError("unavailable", "No pudimos revisar tu pago anterior. Inténtalo en un momento.");
    }
  }

  const { email } = await getAuth().getUser(uid);
  const compraRef = db().collection("compras").doc();
  await compraRef.set({ uid, funcion, nombre: producto.nombre, monto: producto.precio, estado: "pendiente", creado: Date.now() });
  try {
    const { url, flowOrder } = await proveedor.crearPago({
      orden: compraRef.id, asunto: `ServicePlanet: ${producto.nombre}`, monto: producto.precio, correo: email,
      urlConfirmacion: `${BASE_FUNCIONES}/confirmarPagoFlow`, urlRetorno: `${BASE_FUNCIONES}/retornoPagoFlow`,
      segundosParaPagar: UNA_HORA_EN_SEGUNDOS
    });
    await compraRef.update({ flowOrder });
    return { url };
  } catch (error) {
    console.error(error);
    await compraRef.update({ estado: "fallida" });
    throw new HttpsError("unavailable", "No pudimos abrir el pago. No se te cobró nada. Inténtalo de nuevo.");
  }
});

const tokenValido = (valor) => {
  const token = String(valor || "");
  return /^[\w-]{1,200}$/.test(token) ? token : null;
};

async function procesarToken(token) {
  const pago = await crearProveedor().pagoPorToken(token);
  return aplicarPago(pago.orden, pago);
}

// Flow avisa aquí directo al servidor, aunque la persona haya cerrado la ventana
exports.confirmarPagoFlow = onRequest({ region: REGION }, async (req, res) => {
  const token = tokenValido(req.body?.token);
  if (!token) return res.status(400).send("Falta el token");
  try {
    await procesarToken(token);
    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error"); // con un error, Flow puede volver a avisar y el cobrador diario también lo revisa
  }
});

// Aquí vuelve la persona después de pagar. Se consulta a Flow y se la lleva a la tienda con el resultado.
exports.retornoPagoFlow = onRequest({ region: REGION }, async (req, res) => {
  let estado = "pendiente";
  const token = tokenValido(req.body?.token || req.query?.token);
  if (token) {
    try {
      estado = await procesarToken(token);
    } catch (error) {
      console.error(error);
    }
  }
  const resultado = estado === "pagado" || estado === "rechazado" ? estado : "pendiente";
  res.redirect(303, `${SITIO}/panel?compra=${resultado}#tienda`);
});

// Cada día se revisan los pagos sin confirmar, por si un aviso de Flow no llegó
exports.revisarComprasPendientes = onSchedule({ schedule: "every day 08:00", timeZone: "America/Santiago", region: REGION_PROGRAMADAS, timeoutSeconds: 300 }, async () => {
  const pendientes = await db().collection("compras").where("estado", "==", "pendiente").get();
  if (pendientes.empty) return;
  const proveedor = crearProveedor();
  for (const doc of pendientes.docs) {
    try {
      const pago = await proveedor.pagoPorOrden(doc.id);
      if (compraVencida(doc.data(), pago, Date.now())) await doc.ref.update({ estado: "vencida" });
      else if (pago.estado !== "no_existe") await aplicarPago(doc.id, pago);
    } catch (error) {
      console.error(`Error revisando la compra ${doc.id}`, error); // sigue con las demás
    }
  }
});
