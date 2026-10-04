import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const COLORES = ["#ffe5d8", "#e9e0ff", "#dff5e8", "#fff1c9", "#e3edff"];
const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const $ = (selector) => document.querySelector(selector);

let perfil = null;
let carrito = new Map();   // nombre del servicio → { producto, cantidad, boton }
let elegido = null;        // servicio elegido cuando no hay carrito
let uidPerfil = null;      // dueño de la página (para guardar reservas)
let horaElegida = "";     // turno elegido en la agenda
let modalidadElegida = ""; // presencial, videollamada o llamada

// Lee el enlace desde serviceplanet.cl/maria-pasteleria (Vercel) o pagina.html?u=maria-pasteleria (local)
function obtenerSlug() {
  const desdeParametro = new URLSearchParams(location.search).get("u");
  if (desdeParametro) return desdeParametro.toLowerCase();
  const ultimo = location.pathname.split("/").filter(Boolean).pop() || "";
  return ultimo.includes(".") || ultimo === "pagina" ? "" : ultimo.toLowerCase();
}

// Pone una imagen de fondo en un elemento (o la quita si no hay)
function pintarImagen(elemento, dataUrl) {
  elemento.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : "";
  elemento.classList.toggle("has-image", Boolean(dataUrl));
}

function noEncontrado() {
  const slug = obtenerSlug();
  document.title = "Página no encontrada — ServicePlanet";
  // Que los buscadores no guarden esta página vacía
  document.head.append(Object.assign(document.createElement("meta"), { name: "robots", content: "noindex" }));
  if (/^[a-z0-9-]{3,40}$/.test(slug)) {
    $("#lost-enlace").textContent = `serviceplanet.cl/${slug}`;
    $("#lost-reclamar").hidden = false;
    $("#lost-texto").textContent = "Nadie ha creado todavía una página con este enlace. Revisa que esté bien escrito.";
  }
  $("#estado").hidden = true;
  $("#no-encontrado").hidden = false;
}

async function cargar() {
  const slug = obtenerSlug();
  if (!slug) return noEncontrado();

  try {
    // 1) El enlace nos dice de quién es la página
    const slugSnap = await getDoc(doc(db, "slugs", slug));
    if (!slugSnap.exists()) return noEncontrado();
    const uid = slugSnap.data().uid;
    uidPerfil = uid;

    // 2) Con eso cargamos el perfil y los servicios
    const [perfilSnap, productosSnap] = await Promise.all([
      getDoc(doc(db, "perfiles", uid)),
      getDocs(query(collection(db, "perfiles", uid, "productos"), orderBy("creado")))
    ]);
    if (!perfilSnap.exists()) return noEncontrado();

    mostrar(perfilSnap.data(), productosSnap.docs.map((d) => d.data()));
  } catch (error) {
    console.error(error);
    $("#estado").textContent = "No pudimos cargar esta página. Revisa tu conexión e inténtalo de nuevo.";
    return;
  }

  // La galería va aparte: si falla, el resto de la página igual se ve
  try {
    const galeria = await getDocs(query(collection(db, "perfiles", uidPerfil, "galeria"), orderBy("creado")));
    mostrarGaleria(galeria.docs.map((d) => d.data().imagen).filter(Boolean));
  } catch (error) {
    console.error(error);
  }
}

function mostrarGaleria(imagenes) {
  if (imagenes.length === 0) return;
  imagenes.forEach((imagen, i) => {
    const foto = document.createElement("button");
    foto.type = "button";
    foto.className = "pro-photo has-image";
    foto.style.backgroundImage = `url("${imagen}")`;
    foto.setAttribute("aria-label", `Ver trabajo ${i + 1} en grande`);
    foto.addEventListener("click", () => {
      $("#lightbox-img").src = imagen;
      $("#lightbox").showModal();
    });
    $("#c-galeria").append(foto);
  });
  $("#c-galeria-seccion").hidden = false;
}
$("#lightbox-close").addEventListener("click", () => $("#lightbox").close());
$("#lightbox").addEventListener("click", (event) => { if (event.target === $("#lightbox")) $("#lightbox").close(); });

// "$5.000 la hora" → 5000 (null si no hay número, ej: "A convenir")
function precioNumero(texto = "") {
  const encontrado = texto.match(/\d[\d.]*/);
  return encontrado ? Number(encontrado[0].replace(/\./g, "")) : null;
}
const pesos = (n) => "$" + n.toLocaleString("es-CL");
const conHttps = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

// ¿Está abierto ahora? Considera horarios que pasan la medianoche (ej: 20:00 a 02:00)
function estadoHorario(horario) {
  if (!horario?.dias?.length || !horario.abre || !horario.cierra) return null;
  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const [ha, ma] = horario.abre.split(":").map(Number);
  const [hc, mc] = horario.cierra.split(":").map(Number);
  const abre = ha * 60 + ma;
  const cierra = hc * 60 + mc;
  const hoy = ahora.getDay();
  const ayer = (hoy + 6) % 7;
  const abierto = abre < cierra
    ? horario.dias.includes(hoy) && minutos >= abre && minutos < cierra
    : (horario.dias.includes(hoy) && minutos >= abre) || (horario.dias.includes(ayer) && minutos < cierra);
  const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => horario.dias.includes(d)).map((d) => DIAS[d]).join(", ");
  return { abierto, texto: `${dias} · ${horario.abre} a ${horario.cierra}` };
}

function mostrarRedes(redes = {}) {
  const enlaces = [
    redes.instagram && ["Instagram", `https://instagram.com/${redes.instagram}`],
    redes.tiktok && ["TikTok", `https://www.tiktok.com/@${redes.tiktok}`],
    redes.facebook && ["Facebook", conHttps(redes.facebook)],
    redes.web && ["Sitio web", conHttps(redes.web)],
    redes.email && ["Correo", `mailto:${redes.email}`]
  ].filter(Boolean);
  enlaces.forEach(([nombre, url]) => {
    const a = document.createElement("a");
    a.className = "social-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = nombre;
    $("#c-redes").append(a);
  });
}

function mostrar(datos, productos) {
  perfil = datos;
  document.title = `${perfil.nombre} — ServicePlanet`;
  if (perfil.color) {
    document.documentElement.style.setProperty("--accent", perfil.color);
    // Con colores muy claros (amarillo, celeste…) el texto encima va oscuro para que se lea
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(perfil.color.slice(i, i + 2), 16));
    if (0.299 * r + 0.587 * g + 0.114 * b > 170) document.documentElement.style.setProperty("--accent-ink", "#152238");
  }
  pintarImagen($("#c-portada"), perfil.portada);
  const inicial = perfil.nombre.charAt(0).toUpperCase();
  [$("#c-avatar"), $("#c-mini-logo")].forEach((avatar) => {
    pintarImagen(avatar, perfil.logo);
    avatar.textContent = perfil.logo ? "" : inicial;
  });
  $("#c-nombre").textContent = perfil.nombre;
  $("#c-mini-nombre").textContent = perfil.nombre;
  $("#c-zona").textContent = perfil.zona ? `📍 ${perfil.zona}` : "";
  $("#c-descripcion").textContent = perfil.descripcion;
  if (perfil.zona) {
    $("#c-zona-info").textContent = perfil.zona;
    $("#c-zona-box").hidden = false;
  }
  $("#c-telefono").textContent = `WhatsApp +${perfil.whatsapp}`;
  if (perfil.aviso) {
    $("#c-aviso").textContent = `📣 ${perfil.aviso}`;
    $("#c-aviso").hidden = false;
  }
  mostrarRedes(perfil.redes);

  const estado = estadoHorario(perfil.horario);
  if (estado) {
    $("#c-abierto").textContent = estado.abierto ? "Abierto ahora" : "Cerrado ahora";
    $("#c-abierto").classList.toggle("closed", !estado.abierto);
    $("#c-abierto").hidden = false;
    $("#c-horario").textContent = estado.texto;
    $("#c-horario-box").hidden = false;
  }

  // Señales de confianza: solo datos reales que la persona configuró
  const confianza = [
    perfil.experiencia && `${perfil.experiencia} ${Number(perfil.experiencia) === 1 ? "año" : "años"} de experiencia`,
    perfil.reservas && "Reserva en línea",
    "Respuesta por WhatsApp",
    perfil.zona && /domicilio/i.test(perfil.zona) && "Atiende a domicilio"
  ].filter(Boolean);
  confianza.forEach((texto) => {
    const li = document.createElement("li");
    li.textContent = texto;
    $("#c-confianza").append(li);
  });

  // Destacados primero; los pausados no se muestran
  const visibles = productos
    .filter((p) => !p.oculto)
    .sort((a, b) => Number(Boolean(b.destacado)) - Number(Boolean(a.destacado)));

  const lista = $("#c-productos");
  if (visibles.length === 0) {
    lista.innerHTML = '<p class="catalog-empty">Pronto habrá novedades aquí.</p>';
  }

  visibles.forEach((producto, i) => {
    const boton = $("#producto-molde").content.firstElementChild.cloneNode(true);
    const imagen = boton.querySelector(".product-image");
    imagen.style.backgroundColor = COLORES[i % COLORES.length];
    pintarImagen(imagen, producto.imagen);
    imagen.textContent = producto.imagen ? "" : (producto.emoji || producto.nombre.charAt(0).toUpperCase());
    boton.querySelector("strong").textContent = producto.nombre;
    if (producto.destacado) boton.querySelector("strong").insertAdjacentHTML("afterbegin", '<span class="pro-featured">Destacado</span>');
    boton.querySelector(".pro-price").textContent = producto.precio;
    boton.querySelector(".pro-action").textContent = textoAccion();
    boton.querySelector(".product-meta").textContent = producto.duracion ? `⏱ ${producto.duracion}` : "";
    boton.querySelector(".product-desc").textContent = producto.descripcion;
    boton.dataset.categoria = producto.categoria || "";
    boton.dataset.texto = `${producto.nombre} ${producto.descripcion || ""} ${producto.categoria || ""}`.toLowerCase();
    boton.addEventListener("click", () => (perfil.carrito ? agregarAlCarrito(producto, boton) : elegirServicio(producto, boton)));
    lista.append(boton);
  });

  $("#c-cantidad").textContent = visibles.length ? `${visibles.length} ${visibles.length === 1 ? "servicio" : "servicios"}` : "";
  prepararFiltros(visibles);
  actualizarBotonWhatsapp();

  $("#estado").hidden = true;
  $("#catalogo").hidden = false;
  $("#c-whatsapp").hidden = false;
  ubicarFormulario();
  prepararHoja();
}

const textoAccion = () => (perfil.carrito ? "Agregar" : perfil.reservas ? "Reservar" : "Consultar");

// ---------- Formulario: al costado en computador, como hoja en celular ----------

const pantallaGrande = matchMedia("(min-width: 960px)");
const enLateral = () => pantallaGrande.matches;

function ubicarFormulario() {
  const formulario = $("#sheet-form");
  if (enLateral()) {
    if ($("#sheet").open) $("#sheet").close();
    $("#pro-side").append(formulario);
  } else {
    $("#sheet").append(formulario);
  }
  document.body.classList.toggle("side-form", enLateral());
  actualizarCarrito();
}
pantallaGrande.addEventListener("change", () => { if (perfil) ubicarFormulario(); });

// ---------- Buscador y categorías ----------

function prepararFiltros(productos) {
  const categorias = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
  if (productos.length < 6 && categorias.length < 2) return; // con pocos servicios no hace falta
  $("#c-herramientas").hidden = false;
  let categoriaActiva = "";

  function filtrar() {
    const busqueda = $("#c-buscar").value.trim().toLowerCase();
    let hay = false;
    $("#c-productos").querySelectorAll(".product").forEach((b) => {
      const visible = (!categoriaActiva || b.dataset.categoria === categoriaActiva) && b.dataset.texto.includes(busqueda);
      b.hidden = !visible;
      hay ||= visible;
    });
    $("#c-sin-resultados").hidden = hay;
  }

  if (categorias.length >= 2) {
    ["", ...categorias].forEach((categoria) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (categoria === "" ? " active" : "");
      chip.textContent = categoria || "Todos";
      chip.addEventListener("click", () => {
        categoriaActiva = categoria;
        $("#c-categorias").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        filtrar();
      });
      $("#c-categorias").append(chip);
    });
  }
  $("#c-buscar").addEventListener("input", filtrar);
}

// ---------- Pedido por WhatsApp ----------

// Vamos directo a api.whatsapp.com: el desvío de wa.me rompe los emojis (💻 llegaba como �)
const enlaceWhatsapp = (texto) => `https://api.whatsapp.com/send?phone=${perfil.whatsapp}&text=${encodeURIComponent(texto)}`;

function elegirServicio(producto, boton) {
  $("#c-productos").querySelectorAll(".product.selected").forEach((b) => b.classList.remove("selected"));
  boton.classList.add("selected");
  elegido = producto;
  actualizarBotonWhatsapp();
  dibujarHoja();
  if (enLateral()) {
    $("#f-nombre").focus({ preventScroll: true });
    $("#pro-side").classList.remove("pulse");
    void $("#pro-side").offsetWidth; // reinicia la animación
    $("#pro-side").classList.add("pulse");
  } else if (perfil.reservas) {
    abrirHoja();
  }
}

function agregarAlCarrito(producto, boton) {
  const item = carrito.get(producto.nombre) || { producto, cantidad: 0, boton };
  carrito.set(producto.nombre, item);
  cambiarCantidad(producto.nombre, 1);
}

function cambiarCantidad(nombre, cambio) {
  const item = carrito.get(nombre);
  item.cantidad += cambio;
  if (item.cantidad <= 0) carrito.delete(nombre);
  item.boton.classList.toggle("selected", item.cantidad > 0);
  item.boton.querySelector(".pro-action").textContent = item.cantidad > 0 ? `✓ ${item.cantidad} en tu pedido` : textoAccion();
  actualizarCarrito();
  if ($("#sheet").open && carrito.size === 0) $("#sheet").close();
  dibujarHoja();
}

function totalCarrito() {
  let total = 0;
  let completo = true;
  carrito.forEach(({ producto, cantidad }) => {
    const n = precioNumero(producto.precio);
    if (n === null) completo = false;
    else total += n * cantidad;
  });
  return { total, completo };
}

function textoTotal() {
  const { total, completo } = totalCarrito();
  return total ? pesos(total) + (completo ? "" : " + a convenir") : "";
}

function actualizarCarrito() {
  const cantidad = [...carrito.values()].reduce((suma, item) => suma + item.cantidad, 0);
  $("#cart-count").textContent = cantidad;
  $("#cart-total").textContent = textoTotal();
  $("#cart-bar").hidden = cantidad === 0 || enLateral();
  document.body.classList.toggle("has-cart", cantidad > 0);
}

function actualizarBotonWhatsapp() {
  const verbo = perfil.reservas ? "Reservar" : "Consultar por";
  $("#c-whatsapp-texto").textContent = elegido ? `${verbo} ${elegido.nombre}` : `${perfil.reservas ? "Reservar" : "Consultar"} por WhatsApp`;
  const consulta = elegido
    ? `Hola ${perfil.nombre}, quiero consultar por ${elegido.nombre}${elegido.precio ? ` (${elegido.precio})` : ""}.`
    : `Hola ${perfil.nombre}, vi tu página en ServicePlanet y quiero hacer una consulta.`;
  $("#c-whatsapp").href = enlaceWhatsapp(consulta);
}

// Con reservas, o con algo en el carrito, el botón abre la hoja para completar datos antes de ir a WhatsApp
$("#c-whatsapp").addEventListener("click", (event) => {
  if (!perfil.reservas && carrito.size === 0) return;
  event.preventDefault();
  abrirHoja();
});
$("#cart-bar").addEventListener("click", abrirHoja);
$("#sheet-close").addEventListener("click", () => $("#sheet").close());

function abrirHoja() {
  prepararHoja();
  if (enLateral()) {
    $("#f-nombre").focus();
    return;
  }
  $("#sheet").showModal();
}

function prepararHoja() {
  $("#sheet-title").textContent = perfil.reservas ? "Reserva tu hora" : perfil.carrito ? "Tu pedido" : "Escríbenos";
  $("#f-reserva").hidden = !perfil.reservas;
  $("#f-fecha").required = Boolean(perfil.reservas);
  $("#f-hora").required = Boolean(perfil.reservas) && !usaTurnos();
  $("#f-hora-libre").hidden = usaTurnos();
  $("#f-turnos").hidden = !usaTurnos();
  if (usaTurnos() && $("#f-fecha").value) dibujarTurnos();
  dibujarModalidades();
  const hoy = new Date();
  $("#f-fecha").min = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("#f-mensaje").textContent = "";
  dibujarHoja();
}

function dibujarHoja() {
  if (!perfil) return;
  const lista = $("#cart-list");
  lista.innerHTML = "";
  const items = carrito.size ? [...carrito.values()] : (elegido ? [{ producto: elegido, cantidad: 1 }] : []);
  $("#sheet-vacio").textContent = items.length ? "" : perfil.carrito
    ? "Agrega servicios desde la lista para armar tu pedido."
    : "Elige un servicio de la lista o escríbenos tu consulta.";
  items.forEach(({ producto, cantidad }) => {
    const li = document.createElement("li");
    const nombre = document.createElement("span");
    nombre.textContent = `${producto.nombre}${producto.precio ? ` · ${producto.precio}` : ""}`;
    li.append(nombre);
    if (carrito.size) {
      const controles = document.createElement("span");
      controles.className = "cart-qty";
      const menos = Object.assign(document.createElement("button"), { type: "button", textContent: "−", className: "qty" });
      const mas = Object.assign(document.createElement("button"), { type: "button", textContent: "+", className: "qty" });
      menos.setAttribute("aria-label", `Quitar uno de ${producto.nombre}`);
      mas.setAttribute("aria-label", `Agregar uno de ${producto.nombre}`);
      menos.addEventListener("click", () => cambiarCantidad(producto.nombre, -1));
      mas.addEventListener("click", () => cambiarCantidad(producto.nombre, 1));
      controles.append(menos, String(cantidad), mas);
      li.append(controles);
    }
    lista.append(li);
  });
  const total = textoTotal();
  $("#cart-sum").textContent = carrito.size && total ? `Total estimado: ${total}` : "";
}

$("#sheet-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const lineas = [`Hola ${perfil.nombre}, soy ${$("#f-nombre").value.trim()}. Te escribo desde tu página de ServicePlanet.`];

  if (carrito.size) {
    lineas.push("", "*Mi pedido:*");
    carrito.forEach(({ producto, cantidad }) => {
      lineas.push(`• ${cantidad} × ${producto.nombre}${producto.precio ? ` (${producto.precio})` : ""}`);
    });
    const total = textoTotal();
    if (total) lineas.push(`*Total estimado:* ${total}`);
  } else if (elegido) {
    lineas.push("", `*Servicio:* ${elegido.nombre}${elegido.precio ? ` (${elegido.precio})` : ""}`);
  }

  if (perfil.reservas) {
    const fecha = new Date(`${$("#f-fecha").value}T00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    if (ofreceModalidades() && !modalidadElegida) return mostrarError("Elige cómo prefieres la cita.");
    const hora = usaTurnos() ? horaElegida : $("#f-hora").value;
    if (usaTurnos()) {
      if (!horaElegida) return mostrarError("Elige una de las horas disponibles.");
      if (!(await guardarReserva())) return;
    }
    lineas.push(`*Reserva:* ${fecha} a las ${hora}`);
    if (modalidadElegida) {
      lineas.push(`*Tipo de cita:* ${MODALIDADES[modalidadElegida]}`);
      if (modalidadElegida === "videollamada" && perfil.enlaceVideo) lineas.push(`*Enlace de la videollamada:* ${perfil.enlaceVideo}`);
    }
  }
  const nota = $("#f-nota").value.trim();
  if (nota) lineas.push(`*Comentario:* ${nota}`);

  const enlace = enlaceWhatsapp(lineas.join("\n"));
  if ($("#sheet").open) $("#sheet").close();
  // Tras guardar en la agenda el navegador ya no deja abrir otra pestaña, así que vamos a WhatsApp en la misma
  if (usaTurnos()) location.href = enlace;
  else window.open(enlace, "_blank", "noopener");
});

// ---------- Agenda: horas libres y ocupadas ----------

// Solo bloqueamos horas si hay reservas activas y un horario de atención completo
function usaTurnos() {
  const h = perfil.horario;
  return Boolean(perfil.reservas && h?.dias?.length && h.abre && h.cierra);
}

const aMinutos = (hora) => { const [h, m] = hora.split(":").map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const idTurno = (fecha, hora) => `${fecha}_${hora.replace(":", "-")}`; // "2026-10-15_14-30"
const ocupadosRef = () => collection(db, "perfiles", uidPerfil, "ocupados");

function mostrarError(texto) {
  $("#f-mensaje").textContent = texto;
}

async function dibujarTurnos() {
  horaElegida = "";
  const caja = $("#f-slots");
  const fecha = $("#f-fecha").value;
  if (!fecha) return;
  const dia = new Date(`${fecha}T00:00`).getDay();
  if (!perfil.horario.dias.includes(dia)) {
    caja.innerHTML = '<p class="panel-hint">Ese día no hay atención. Prueba otra fecha.</p>';
    return;
  }
  caja.innerHTML = '<p class="panel-hint">Buscando horas libres…</p>';

  // Turnos desde la apertura hasta el cierre (si cierra pasada la medianoche, llegamos hasta las 24:00)
  const turno = perfil.turno || 60;
  const abre = aMinutos(perfil.horario.abre);
  let cierra = aMinutos(perfil.horario.cierra);
  if (cierra <= abre) cierra = 24 * 60;
  const ahora = new Date();
  const esHoy = fecha === ahora.toLocaleDateString("en-CA");
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  let ocupadas;
  try {
    const snap = await getDocs(query(ocupadosRef(), where("fecha", "==", fecha)));
    ocupadas = new Set(snap.docs.map((d) => d.data().hora));
  } catch (error) {
    console.error(error);
    caja.innerHTML = '<p class="panel-hint">No pudimos cargar las horas. Inténtalo de nuevo.</p>';
    return;
  }
  if ($("#f-fecha").value !== fecha) return; // cambió la fecha mientras cargaba

  caja.innerHTML = "";
  for (let inicio = abre; inicio + turno <= cierra; inicio += turno) {
    const hora = aHora(inicio);
    const boton = Object.assign(document.createElement("button"), { type: "button", className: "slot", textContent: hora });
    boton.disabled = ocupadas.has(hora) || (esHoy && inicio <= minutosAhora);
    if (ocupadas.has(hora)) boton.title = "Ocupada";
    boton.addEventListener("click", () => {
      caja.querySelectorAll(".slot.active").forEach((b) => b.classList.remove("active"));
      boton.classList.add("active");
      horaElegida = hora;
      mostrarError("");
    });
    caja.append(boton);
  }
  if (!caja.querySelector(".slot:not(:disabled)")) {
    caja.insertAdjacentHTML("afterbegin", '<p class="panel-hint">No quedan horas libres este día.</p>');
  }
}
$("#f-fecha").addEventListener("change", () => { if (usaTurnos()) dibujarTurnos(); });

// Guarda la hora ocupada (pública, sin datos personales) y la reserva (solo la ve el dueño) en un solo paso.
// Si otra persona tomó esa hora un segundo antes, Firestore rechaza todo.
async function guardarReserva() {
  const fecha = $("#f-fecha").value;
  const id = idTurno(fecha, horaElegida);
  const servicios = carrito.size
    ? [...carrito.values()].map(({ producto, cantidad }) => `${cantidad} × ${producto.nombre}`).join(", ")
    : (elegido?.nombre || "");
  const batch = writeBatch(db);
  batch.set(doc(ocupadosRef(), id), { fecha, hora: horaElegida, creado: serverTimestamp() });
  batch.set(doc(db, "perfiles", uidPerfil, "reservas", id), {
    fecha,
    hora: horaElegida,
    nombre: $("#f-nombre").value.trim().slice(0, 60),
    servicio: servicios.slice(0, 200),
    nota: $("#f-nota").value.trim().slice(0, 300),
    ...(modalidadElegida && { modalidad: modalidadElegida }), // solo si eligió tipo de cita
    creado: serverTimestamp()
  });
  try {
    await batch.commit();
    return true;
  } catch (error) {
    console.error(error);
    mostrarError("Esa hora se acaba de ocupar. Elige otra, por favor.");
    dibujarTurnos();
    return false;
  }
}

// ---------- Compartir y guardar contacto ----------

$("#c-compartir").addEventListener("click", async () => {
  try {
    if (navigator.share) {
      await navigator.share({ title: perfil.nombre, text: perfil.descripcion, url: location.href });
      return;
    }
    await navigator.clipboard.writeText(location.href);
    $("#c-compartir").textContent = "¡Enlace copiado!";
  } catch (error) {
    // La persona cerró el menú de compartir: no hacemos nada
  }
});

// Descarga una tarjeta de contacto (.vcf) para guardar el número en el teléfono
$("#c-contacto").addEventListener("click", () => {
  const vcard = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${perfil.nombre}`,
    `TEL;TYPE=CELL:+${perfil.whatsapp}`,
    perfil.redes?.email && `EMAIL:${perfil.redes.email}`,
    `URL:${location.href}`,
    perfil.descripcion && `NOTE:${perfil.descripcion.replace(/\n/g, " ")}`,
    "END:VCARD"
  ].filter(Boolean).join("\r\n");
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([vcard], { type: "text/vcard" }));
  enlace.download = `${perfil.slug || "contacto"}.vcf`;
  enlace.click();
});

cargar();

// ---------- Tipo de cita: presencial, videollamada o llamada ----------
const MODALIDADES = { presencial: "🤝 Presencial", videollamada: "💻 Videollamada", llamada: "📞 Llamada telefónica" };
const ofreceModalidades = () => Boolean(perfil.reservas && perfil.modalidades?.length);

function dibujarModalidades() {
  $("#f-modalidad").hidden = !ofreceModalidades();
  if (!ofreceModalidades()) { modalidadElegida = ""; return; }
  // Si solo hay una opción, queda elegida de una vez
  if (perfil.modalidades.length === 1) modalidadElegida = perfil.modalidades[0];
  const contenedor = $("#f-modalidades");
  contenedor.innerHTML = "";
  perfil.modalidades.filter((m) => MODALIDADES[m]).forEach((m) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "slot" + (m === modalidadElegida ? " active" : "");
    boton.textContent = MODALIDADES[m];
    boton.addEventListener("click", () => { modalidadElegida = m; dibujarModalidades(); });
    contenedor.append(boton);
  });
}
