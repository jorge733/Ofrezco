// Tienda del panel: funciones extra de pago único.
// El cobro y la activación los hace el servidor (functions/tienda.js). Aquí solo se muestra y se pide comprar.
import { app, auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// Si cambias un precio, cámbialo también en functions/tienda/catalogo.js (los tests avisan si no coinciden)
const PRODUCTOS = [
  { id: "quitarMarca", precio: 14990, disponible: true, nombre: "Quitar la marca ServicePlanet", texto: "Tu página deja de mostrar \"Página creada con ServicePlanet\" al pie." },
  { id: "portadaImpacto", precio: 9990, disponible: true, diseno: true, nombre: "Diseño Portada de impacto", texto: "Tu portada ocupa casi toda la pantalla, con tu nombre en grande." },
  { id: "tiendaLateral", precio: 9990, disponible: true, diseno: true, nombre: "Diseño Tienda con barra lateral", texto: "Tu marca fija a un costado y tus servicios como vitrina de tarjetas." },
  { id: "linkBio", precio: 9990, disponible: true, diseno: true, nombre: "Diseño Link en bio premium", texto: "Una sola columna con fondo de tu color, ideal para Instagram y TikTok." },
  { id: "miniSitio", precio: 9990, disponible: true, diseno: true, nombre: "Diseño Mini sitio web completo", texto: "Menú, presentación a dos columnas y secciones a todo el ancho." },
  { id: "estadisticas", precio: 12990, disponible: false, nombre: "Estadísticas de visitas", texto: "Mira cuántas personas visitan tu página y te escriben por WhatsApp." }
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
let enlace = ""; // el enlace de la página de esta persona, para ver los diseños de ejemplo
const vistaPrevia = (id) => (["localhost", "127.0.0.1"].includes(location.hostname)
  ? `pagina.html?u=${enlace}&vista-diseno=${id}`
  : `/${enlace}?vista-diseno=${id}`);

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
    if (producto.diseno && enlace) {
      info.append(Object.assign(document.createElement("a"), { className: "store-example", href: vistaPrevia(producto.id), target: "_blank", rel: "noopener", textContent: "Ver cómo queda mi página ↗" }));
    }
    const compra = document.createElement("div");
    compra.className = "store-buy";
    compra.append(Object.assign(document.createElement("span"), { className: "store-price", textContent: pesos(producto.precio) }));

    if (activas.includes(producto.id)) {
      item.classList.add("store-owned");
      compra.append(Object.assign(document.createElement("span"), { className: "store-state", textContent: "✓ Activa" }));
      if (producto.diseno) compra.append(Object.assign(document.createElement("span"), { className: "store-hint", textContent: "Elígelo en Tu perfil" }));
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

// Los diseños del formulario de perfil: se pueden elegir solo si están comprados; si no, llevan a la Tienda
function pintarDisenos() {
  document.querySelectorAll(".design-option[data-funcion]").forEach((opcion) => {
    const producto = PRODUCTOS.find((p) => p.id === opcion.dataset.funcion);
    const comprado = activas.includes(producto.id);
    opcion.classList.toggle("locked", !comprado);
    opcion.querySelector("input").disabled = !comprado;
    opcion.querySelector("small").textContent = comprado ? "Comprado" : `${pesos(producto.precio)} · Ver en la Tienda`;
  });
}
document.querySelectorAll(".design-option[data-funcion]").forEach((opcion) => {
  opcion.addEventListener("click", (evento) => {
    if (!opcion.classList.contains("locked")) return;
    evento.preventDefault();
    document.querySelector('.side-item[data-go="tienda"]').click();
  });
});

pintar();
pintarDisenos();

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
    pintarDisenos();
  }, (error) => console.error(error));
  getDoc(doc(db, "perfiles", usuario.uid)).then((perfil) => {
    enlace = perfil.data()?.slug || "";
    pintar();
  }).catch((error) => console.error(error));
});
