// Tienda del panel: funciones extra de pago único.
// El cobro y la activación los hace el servidor (functions/tienda.js). Aquí solo se muestra y se pide comprar.
import { app, auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// Si cambias un precio, cámbialo también en functions/tienda/catalogo.js (los tests avisan si no coinciden)
const PRODUCTOS = [
  { id: "quitarMarca", precio: 14990, disponible: true, nombre: "Quitar la marca ServicePlanet", texto: "Tu página deja de mostrar \"Página creada con ServicePlanet\" al pie." },
  { id: "estadisticas", precio: 12990, disponible: false, nombre: "Estadísticas de visitas", texto: "Mira cuántas personas visitan tu página y te escriben por WhatsApp." },
  { id: "portadaImpacto", precio: 9990, disponible: false, nombre: "Diseño Portada de impacto", texto: "Un diseño más llamativo para la primera impresión de tu página." }
];

const MENSAJES_RETORNO = {
  pagado: ["¡Listo! Tu compra quedó activa.", true],
  pendiente: ["Estamos confirmando tu pago. La función se activará apenas Flow lo confirme.", true],
  rechazado: ["El pago no se completó y no se activó la función. Puedes intentarlo de nuevo.", false]
};

const $ = (selector) => document.querySelector(selector);
const pesos = (monto) => `$${monto.toLocaleString("es-CL")}`;
const comprar = httpsCallable(getFunctions(app, "southamerica-west1"), "comprarFuncion");
let activas = [];

function mensaje(texto, ok = false) {
  const caja = $("#tienda-mensaje");
  caja.textContent = texto;
  caja.classList.toggle("ok", ok);
}

function pintar() {
  $("#tienda-lista").replaceChildren(...PRODUCTOS.map((producto) => {
    const item = document.createElement("li");
    item.className = "store-item";
    const info = document.createElement("div");
    info.append(
      Object.assign(document.createElement("strong"), { textContent: producto.nombre }),
      Object.assign(document.createElement("p"), { textContent: producto.texto })
    );
    const compra = document.createElement("div");
    compra.className = "store-buy";
    compra.append(Object.assign(document.createElement("span"), { className: "store-price", textContent: pesos(producto.precio) }));

    if (activas.includes(producto.id)) {
      item.classList.add("store-owned");
      compra.append(Object.assign(document.createElement("span"), { className: "store-state", textContent: "✓ Activa" }));
    } else if (!producto.disponible) {
      compra.append(Object.assign(document.createElement("span"), { className: "store-state", textContent: "Próximamente" }));
    } else {
      const boton = Object.assign(document.createElement("button"), { className: "button button-small", type: "button", textContent: "Comprar" });
      boton.addEventListener("click", () => iniciarCompra(producto, boton));
      compra.append(boton);
    }
    item.append(info, compra);
    return item;
  }));
}

async function iniciarCompra(producto, boton) {
  boton.disabled = true;
  mensaje("Abriendo el pago seguro de Flow…", true);
  try {
    const { data } = await comprar({ funcion: producto.id });
    if (data.yaPagada) return mensaje("¡Listo! Tu pago anterior ya estaba completo y la función quedó activa.", true);
    location.href = data.url;
  } catch (error) {
    boton.disabled = false;
    mensaje(error.message || "No pudimos abrir el pago. Inténtalo de nuevo.");
  }
}

pintar();

const retorno = MENSAJES_RETORNO[new URLSearchParams(location.search).get("compra")];
if (retorno) {
  mensaje(...retorno);
  history.replaceState(null, "", `${location.pathname}#tienda`);
}

onAuthStateChanged(auth, (usuario) => {
  if (!usuario) return;
  onSnapshot(doc(db, "publico", usuario.uid), (snap) => {
    activas = snap.data()?.funciones || [];
    pintar();
  }, (error) => console.error(error));
});
