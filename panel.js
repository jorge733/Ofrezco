import { auth, db } from "./firebase.js";
import { comprimirImagen } from "./imagenes.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  doc,
  getDoc,
  writeBatch,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Enlaces que no se pueden usar porque chocan con páginas o archivos del sitio
const RESERVADOS = ["cuenta", "panel", "pagina", "index", "style", "app", "script", "firebase", "vercel", "logo", "imagenes", "404", "terminos", "privacidad", "contacto", "robots", "sitemap"];

// Tamaño máximo de cada imagen (se achican antes de guardarlas)
const TAMANOS = {
  logo: { ancho: 320, alto: 320, formato: "image/webp", calidad: 0.85 },
  portada: { ancho: 1400, alto: 600 },
  servicio: { ancho: 800, alto: 800 }
};

const $ = (selector) => document.querySelector(selector);

let usuario = null;                           // usuario con sesión iniciada
let perfil = null;                            // perfil guardado en Firestore (null si aún no existe)
let imagenesPerfil = { logo: "", portada: "" }; // imágenes elegidas en el formulario de perfil
let imagenServicio = "";                      // imagen elegida en el formulario de servicio
let editandoId = null;                        // id del servicio que se está editando
let escuchandoProductos = false;
let slugEditado = false;                      // true cuando la persona escribe su enlace a mano

function mostrarMensaje(elemento, texto, ok = false) {
  elemento.textContent = texto;
  elemento.classList.toggle("ok", ok);
}

// Pone una imagen de fondo en un elemento (o la quita si no hay)
function pintarImagen(elemento, dataUrl) {
  elemento.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : "";
  elemento.classList.toggle("has-image", Boolean(dataUrl));
}

// Conecta un <input type="file"> para que achique la imagen elegida
function alElegirImagen(input, tamano, alListo) {
  input.addEventListener("change", async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    try {
      alListo(await comprimirImagen(archivo, tamano));
    } catch (error) {
      console.error(error);
      alert("No pudimos leer esa imagen. Prueba con otra en JPG o PNG.");
    }
  });
}

// ---------- Sesión ----------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "cuenta.html?modo=entrar";
    return;
  }
  usuario = user;
  $("#user-email").textContent = user.email;

  // Saludo con el nombre que dio al crear la cuenta (solo el primer nombre)
  const primerNombre = (user.displayName || "").trim().split(" ")[0];
  if (primerNombre) {
    $("#panel-greeting").textContent = `HOLA, ${primerNombre.toUpperCase()}`;
    $("#welcome-kicker").textContent = `HOLA, ${primerNombre.toUpperCase()}. TE DAMOS LA BIENVENIDA A SERVICE PLANET`;
  }

  const snap = await getDoc(doc(db, "perfiles", user.uid));
  if (snap.exists()) {
    perfil = snap.data();
    mostrarVistaPerfil();
    mostrarEnlace();
    activarProductos();
  } else {
    abrirFormularioPerfil();
    mostrarBienvenida();
  }
  $("#panel").hidden = false;
});

$("#logout").addEventListener("click", () => signOut(auth));

// ---------- Bienvenida ----------

function mostrarBienvenida() {
  try {
    if (localStorage.getItem("sp-bienvenida-vista")) return;
  } catch (error) {
    // Si el navegador bloquea localStorage, igual mostramos la bienvenida
  }
  $("#welcome").hidden = false;
}

$("#welcome-start").addEventListener("click", () => {
  $("#welcome").classList.add("closing");
  setTimeout(() => { $("#welcome").hidden = true; }, 500);
  try {
    localStorage.setItem("sp-bienvenida-vista", "1");
  } catch (error) {
    // Sin localStorage la bienvenida volverá a aparecer, no pasa nada
  }
});

// ---------- Perfil ----------

// "María Pastelería" → "maria-pasteleria"
function crearSlug(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// "+56 9 1234 5678" → "56912345678" (formato que usa wa.me)
function limpiarWhatsapp(texto) {
  let numero = texto.replace(/\D/g, "");
  if (numero.length === 9 && numero.startsWith("9")) numero = "56" + numero; // celular chileno sin código de país
  return numero;
}

function mostrarVistaPerfil() {
  pintarImagen($("#v-portada"), perfil.portada);
  const logo = $("#v-logo");
  pintarImagen(logo, perfil.logo);
  logo.textContent = perfil.logo ? "" : perfil.nombre.charAt(0).toUpperCase();
  $("#v-nombre").textContent = perfil.nombre;
  $("#v-zona").textContent = perfil.zona || "";
  $("#v-descripcion").textContent = perfil.descripcion;
  $("#v-whatsapp").textContent = `WhatsApp: +${perfil.whatsapp}`;

  $("#profile-view").hidden = false;
  $("#profile-form").hidden = true;
  $("#profile-edit").hidden = false;
}

function abrirFormularioPerfil() {
  if (perfil) {
    $("#p-nombre").value = perfil.nombre;
    $("#p-descripcion").value = perfil.descripcion;
    $("#p-zona").value = perfil.zona || "";
    $("#p-whatsapp").value = "+" + perfil.whatsapp;
    $("#p-slug").value = perfil.slug;
    slugEditado = true;
  }
  const redes = perfil?.redes || {};
  ["instagram", "tiktok", "facebook", "web", "email"].forEach((red) => { $(`#p-${red}`).value = redes[red] || ""; });
  const horario = perfil?.horario || {};
  document.querySelectorAll("#p-dias input").forEach((c) => { c.checked = (horario.dias || []).includes(Number(c.value)); });
  $("#p-abre").value = horario.abre || "";
  $("#p-cierra").value = horario.cierra || "";
  $("#p-carrito").checked = Boolean(perfil?.carrito);
  $("#p-reservas").checked = Boolean(perfil?.reservas);
  document.querySelectorAll("#p-modalidades input").forEach((c) => { c.checked = (perfil?.modalidades || []).includes(c.value); });
  $("#p-video").value = perfil?.enlaceVideo || "";
  mostrarCampoVideo();
  $("#p-aviso").value = perfil?.aviso || "";
  $("#p-experiencia").value = perfil?.experiencia || "";
  $("#p-turno").value = String(perfil?.turno || 60);
  elegirColor(perfil?.color || "#1c56d9");
  imagenesPerfil = { logo: perfil?.logo || "", portada: perfil?.portada || "" };
  pintarImagenesPerfil();
  mostrarMensaje($("#profile-message"), "");

  irAPaso(1);
  $("#profile-view").hidden = true;
  $("#profile-form").hidden = false;
  $("#profile-edit").hidden = true;
  $("#profile-cancel").hidden = !perfil; // sin perfil no hay nada a qué volver
}

// ---------- Formularios por pasos ----------
// Convierte un formulario con bloques .step en un asistente con Atrás / Siguiente.
// puedeSaltar() dice si se puede ir directo a cualquier paso (al editar algo que ya existe).
function crearPasos(form, puedeSaltar) {
  const pasos = form.querySelectorAll(".step");
  const circulos = form.querySelectorAll(".stepper li");
  const atras = form.querySelector("[data-step-back]");
  const siguiente = form.querySelector("[data-step-next]");
  const guardar = form.querySelector("[type=submit]");
  const mensaje = form.querySelector(".form-message");
  let actual = 1;

  function irA(numero) {
    actual = numero;
    pasos.forEach((paso) => { paso.hidden = Number(paso.dataset.step) !== numero; });
    circulos.forEach((li, i) => {
      li.classList.toggle("active", i + 1 === numero);
      li.classList.toggle("done", i + 1 < numero);
    });
    const ultimo = numero === pasos.length;
    atras.hidden = numero === 1;
    siguiente.hidden = ultimo;
    guardar.hidden = !ultimo;
    mostrarMensaje(mensaje, "");
  }

  // Revisa los campos obligatorios de un paso; si falta algo, lo marca
  function valido(numero) {
    for (const campo of pasos[numero - 1].querySelectorAll("input, textarea, select")) {
      if (!campo.checkValidity()) {
        irA(numero);
        campo.reportValidity();
        return false;
      }
    }
    return true;
  }

  const subir = () => form.scrollIntoView({ behavior: "smooth", block: "start" });
  siguiente.addEventListener("click", () => { if (valido(actual)) { irA(actual + 1); subir(); } });
  atras.addEventListener("click", () => { irA(actual - 1); subir(); });

  circulos.forEach((li, i) => {
    li.addEventListener("click", () => {
      if (i + 1 < actual || (puedeSaltar() && valido(actual))) irA(i + 1);
    });
  });

  // Enter en un paso intermedio avanza en vez de guardar
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT" && actual < pasos.length) {
      event.preventDefault();
      siguiente.click();
    }
  });

  // Antes de guardar, revisa todos los pasos (se ejecuta antes que el guardado)
  form.addEventListener("submit", (event) => {
    for (let n = 1; n <= pasos.length; n++) {
      if (!valido(n)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
  }, true);

  return irA;
}

const irAPaso = crearPasos($("#profile-form"), () => Boolean(perfil));
const irAPasoServicio = crearPasos($("#product-form"), () => Boolean(editandoId));

function pintarImagenesPerfil() {
  pintarImagen($("#logo-preview"), imagenesPerfil.logo);
  pintarImagen($("#cover-preview"), imagenesPerfil.portada);
  $("#logo-preview").textContent = imagenesPerfil.logo ? "" : "Tu logo";
  $("#cover-preview").textContent = imagenesPerfil.portada ? "" : "Tu imagen de portada";
  $("#logo-remove").hidden = !imagenesPerfil.logo;
  $("#cover-remove").hidden = !imagenesPerfil.portada;
}

$("#profile-edit").addEventListener("click", abrirFormularioPerfil);
$("#profile-cancel").addEventListener("click", mostrarVistaPerfil);

alElegirImagen($("#p-logo"), TAMANOS.logo, (url) => { imagenesPerfil.logo = url; pintarImagenesPerfil(); });
alElegirImagen($("#p-portada"), TAMANOS.portada, (url) => { imagenesPerfil.portada = url; pintarImagenesPerfil(); });
$("#logo-remove").addEventListener("click", () => { imagenesPerfil.logo = ""; pintarImagenesPerfil(); });
$("#cover-remove").addEventListener("click", () => { imagenesPerfil.portada = ""; pintarImagenesPerfil(); });

// ---------- Color de la página ----------
// Se puede elegir un color de la lista, uno libre con la rueda de colores, o escribir su código (#ff7b4a)

let colorElegido = "#1c56d9";

function elegirColor(color) {
  colorElegido = color.toLowerCase();
  const deLista = document.querySelector(`#p-color input[value="${colorElegido}"]`);
  document.querySelectorAll("#p-color input").forEach((r) => { r.checked = r === deLista; });
  $("#p-color-libre").value = colorElegido;
  $("#p-color-codigo").value = colorElegido;
  $(".color-wheel").classList.toggle("active", !deLista);
  $(".color-wheel").style.setProperty("--c", colorElegido);
}

// "f60" o "#FF6600" → "#ff6600" (null si no es un código válido)
function normalizarColor(texto) {
  let codigo = texto.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(codigo)) codigo = codigo.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(codigo) ? `#${codigo}` : null;
}

document.querySelectorAll("#p-color input").forEach((radio) => {
  radio.addEventListener("change", () => elegirColor(radio.value));
});
$("#p-color-libre").addEventListener("input", () => elegirColor($("#p-color-libre").value));
$("#p-color-codigo").addEventListener("input", () => {
  const color = normalizarColor($("#p-color-codigo").value);
  if (color) {
    colorElegido = color;
    $("#p-color-libre").value = color;
    document.querySelectorAll("#p-color input").forEach((r) => { r.checked = r.value === color; });
    $(".color-wheel").classList.toggle("active", !document.querySelector("#p-color input:checked"));
    $(".color-wheel").style.setProperty("--c", color);
  }
});
$("#p-color-codigo").addEventListener("change", () => {
  // Si escribió algo inválido, volvemos a mostrar el último color bueno
  $("#p-color-codigo").value = colorElegido;
});

// Mientras escribe el nombre, sugerimos el enlace (hasta que lo edite a mano)
$("#p-nombre").addEventListener("input", () => {
  if (!slugEditado) $("#p-slug").value = crearSlug($("#p-nombre").value);
});
$("#p-slug").addEventListener("input", () => { slugEditado = true; });
$("#p-slug").addEventListener("change", () => { $("#p-slug").value = crearSlug($("#p-slug").value); });

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const mensaje = $("#profile-message");
  const boton = $("#profile-submit");

  const datos = {
    nombre: $("#p-nombre").value.trim(),
    descripcion: $("#p-descripcion").value.trim(),
    zona: $("#p-zona").value.trim(),
    whatsapp: limpiarWhatsapp($("#p-whatsapp").value),
    slug: crearSlug($("#p-slug").value),
    logo: imagenesPerfil.logo,
    portada: imagenesPerfil.portada,
    redes: {
      instagram: $("#p-instagram").value.trim().replace(/^@/, ""),
      tiktok: $("#p-tiktok").value.trim().replace(/^@/, ""),
      facebook: $("#p-facebook").value.trim(),
      web: $("#p-web").value.trim(),
      email: $("#p-email").value.trim()
    },
    horario: {
      dias: [...document.querySelectorAll("#p-dias input:checked")].map((c) => Number(c.value)),
      abre: $("#p-abre").value,
      cierra: $("#p-cierra").value
    },
    carrito: $("#p-carrito").checked,
    reservas: $("#p-reservas").checked,
    modalidades: [...document.querySelectorAll("#p-modalidades input:checked")].map((c) => c.value),
    enlaceVideo: $("#p-video").value.trim(),
    turno: Number($("#p-turno").value),
    aviso: $("#p-aviso").value.trim(),
    experiencia: Math.min(80, Math.max(0, parseInt($("#p-experiencia").value, 10) || 0)),
    diseno: "profesional",
    color: colorElegido
  };
  $("#p-slug").value = datos.slug;

  if (datos.slug.length < 3) return mostrarMensaje(mensaje, "El enlace debe tener al menos 3 letras o números.");
  if (RESERVADOS.includes(datos.slug)) return mostrarMensaje(mensaje, "Ese enlace no está disponible. Prueba otro.");
  if (datos.whatsapp.length < 10) return mostrarMensaje(mensaje, "Revisa el WhatsApp. Ejemplo: +56 9 1234 5678");

  boton.disabled = true;
  mostrarMensaje(mensaje, "");

  try {
    // Guardamos perfil y enlace juntos: o se guarda todo, o nada.
    const batch = writeBatch(db);
    const slugAnterior = perfil ? perfil.slug : null;

    if (datos.slug !== slugAnterior) {
      const ocupado = await getDoc(doc(db, "slugs", datos.slug));
      if (ocupado.exists()) {
        mostrarMensaje(mensaje, "Ese enlace ya está ocupado. Prueba otro.");
        return;
      }
      batch.set(doc(db, "slugs", datos.slug), { uid: usuario.uid });
      if (slugAnterior) batch.delete(doc(db, "slugs", slugAnterior));
    }

    batch.set(doc(db, "perfiles", usuario.uid), datos);
    await batch.commit();

    perfil = datos;
    mostrarVistaPerfil();
    mostrarEnlace();
    activarProductos();
  } catch (error) {
    console.error(error);
    const texto = error.code === "permission-denied"
      ? "Ese enlace ya está ocupado. Prueba otro."
      : "No se pudo guardar. Inténtalo de nuevo.";
    mostrarMensaje(mensaje, texto);
  } finally {
    boton.disabled = false;
  }
});

// ---------- Enlace para compartir ----------

function enlacePublico(slug) {
  // En tu computador no existen los enlaces "bonitos" (eso lo hace Vercel), así que usamos pagina.html?u=
  const esLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  return esLocal ? `${location.origin}/pagina.html?u=${slug}` : `${location.origin}/${slug}`;
}

function mostrarEnlace() {
  const url = enlacePublico(perfil.slug);
  $("#share-link").href = url;
  $("#share-link").textContent = url.replace(/^https?:\/\//, "");
  $("#share-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(`Mira mi página: ${url}`)}`;
  $("#share-box").hidden = false;
  dibujarQR(url);
  actualizarVistaPrevia();
}

// ---------- Vista previa (PC / móvil) ----------
const ANCHO_PC = 1280; // la página se dibuja como en una pantalla de PC y se achica para caber

function actualizarVistaPrevia() {
  if (!perfil) return;
  $("#preview-card").hidden = false;
  // el ?v= obliga al navegador a cargarla de nuevo con los cambios
  $("#preview-iframe").src = `${enlacePublico(perfil.slug)}${enlacePublico(perfil.slug).includes("?") ? "&" : "?"}v=${Date.now()}`;
  ajustarVistaPrevia();
}

function ajustarVistaPrevia() {
  const escenario = $("#preview-stage");
  const marco = escenario.querySelector(".preview-frame");
  if (!escenario.clientWidth) return; // todavía no se ve en pantalla
  if (escenario.dataset.device === "pc") {
    const escala = Math.min(1, escenario.clientWidth / ANCHO_PC);
    marco.style.setProperty("--escala", escala);
    escenario.style.height = `${800 * escala}px`;
  } else {
    marco.style.setProperty("--escala", 1);
    escenario.style.height = "";
  }
}

document.querySelectorAll(".preview-tabs [data-device]").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll(".preview-tabs [data-device]").forEach((b) => b.classList.toggle("active", b === boton));
    $("#preview-stage").dataset.device = boton.dataset.device;
    ajustarVistaPrevia();
  });
});
$("#preview-reload").addEventListener("click", actualizarVistaPrevia);
window.addEventListener("resize", ajustarVistaPrevia);

// Si cambian los servicios o las fotos, se recarga (esperando un poco para no recargar muchas veces seguidas)
let esperaVistaPrevia;
function refrescarVistaPreviaLuego() {
  clearTimeout(esperaVistaPrevia);
  esperaVistaPrevia = setTimeout(actualizarVistaPrevia, 800);
}

// Código QR para imprimir en el local, tarjetas o flyers
function dibujarQR(url) {
  if (typeof qrcode !== "function") return; // si la librería no cargó, simplemente no mostramos el QR
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  $("#share-qr").innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

$("#download-qr").addEventListener("click", () => {
  if (typeof qrcode !== "function") return alert("No pudimos crear el QR. Recarga la página.");
  const qr = qrcode(0, "M");
  qr.addData($("#share-link").href);
  qr.make();
  const enlace = document.createElement("a");
  enlace.href = qr.createDataURL(12, 4);
  enlace.download = `qr-${perfil.slug}.gif`;
  enlace.click();
});

$("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#share-link").href);
  $("#copy-link").textContent = "¡Copiado!";
  setTimeout(() => { $("#copy-link").textContent = "Copiar enlace"; }, 2000);
});

// ---------- Servicios ----------

function productosRef() {
  return collection(db, "perfiles", usuario.uid, "productos");
}

function activarProductos() {
  $("#products-locked").hidden = true;
  if ($("#product-form").hidden) $("#product-new").hidden = false;
  $("#bookings-card").hidden = !perfil.reservas;
  if (escuchandoProductos) return;
  escuchandoProductos = true;
  escucharReservas();
  escucharGaleria();
  // onSnapshot vuelve a dibujar la lista cada vez que algo cambia en Firestore
  let primeraVez = true; // la primera lectura no cuenta como cambio
  onSnapshot(query(productosRef(), orderBy("creado")), (snap) => {
    mostrarProductos(snap.docs);
    if (!primeraVez) refrescarVistaPreviaLuego();
    primeraVez = false;
  });
}

function mostrarProductos(docs) {
  const lista = $("#product-list");
  lista.innerHTML = "";

  // Sugerimos las categorías que ya usó para que no las escriba distinto cada vez
  const categorias = [...new Set(docs.map((d) => d.data().categoria).filter(Boolean))];
  $("#categorias").innerHTML = "";
  categorias.forEach((c) => $("#categorias").append(new Option(c)));

  if (docs.length === 0) {
    lista.innerHTML = '<li class="panel-hint">Aún no has agregado servicios.</li>';
    return;
  }

  docs.forEach((documento) => {
    const producto = documento.data();
    const item = $("#product-item").content.firstElementChild.cloneNode(true);
    const miniatura = item.querySelector(".product-thumb");
    pintarImagen(miniatura, producto.imagen);
    miniatura.textContent = producto.imagen ? "" : (producto.emoji || producto.nombre.charAt(0).toUpperCase());
    item.querySelector("strong").textContent = producto.nombre;
    item.querySelector(".price").textContent = producto.precio;
    item.querySelector(".row-tags").textContent = [
      producto.destacado && "⭐ Destacado",
      producto.oculto && "⏸ Pausado",
      producto.categoria,
      producto.duracion && `⏱ ${producto.duracion}`
    ].filter(Boolean).join(" · ");
    item.classList.toggle("paused", Boolean(producto.oculto));
    item.querySelector('[data-action="editar"]').addEventListener("click", () => abrirFormularioServicio(documento.id, producto));
    item.querySelector('[data-action="eliminar"]').addEventListener("click", () => eliminarProducto(documento.id, producto.nombre));
    lista.append(item);
  });
}

function pintarImagenServicio() {
  pintarImagen($("#item-preview"), imagenServicio);
  $("#item-preview").textContent = imagenServicio ? "" : "Imagen";
  $("#item-remove").hidden = !imagenServicio;
}

function abrirFormularioServicio(id = null, producto = {}) {
  editandoId = id;
  $("#pr-emoji").value = producto.emoji || "";
  $("#pr-nombre").value = producto.nombre || "";
  $("#pr-precio").value = producto.precio || "";
  $("#pr-descripcion").value = producto.descripcion || "";
  $("#pr-categoria").value = producto.categoria || "";
  $("#pr-duracion").value = producto.duracion || "";
  $("#pr-destacado").checked = Boolean(producto.destacado);
  $("#pr-oculto").checked = Boolean(producto.oculto);
  imagenServicio = producto.imagen || "";
  pintarImagenServicio();
  $("#product-form-title").textContent = id ? "Editar servicio" : "Nuevo servicio";
  $("#product-submit").textContent = id ? "Guardar cambios" : "Agregar servicio";
  irAPasoServicio(1);

  $("#product-form").hidden = false;
  $("#product-new").hidden = true;
  $("#services-card").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#pr-nombre").focus({ preventScroll: true });
}

function cerrarFormularioServicio() {
  editandoId = null;
  imagenServicio = "";
  $("#product-form").reset();
  $("#product-form").hidden = true;
  $("#product-new").hidden = false;
}

// ---------- Precio en pesos chilenos ----------
// "5000 la hora" → "$5.000 la hora", "Desde 24000" → "Desde $24.000".
// Solo toca números de 3 o más cifras (o que ya tengan $), así "2 horas" queda igual.
function formatearPesos(texto) {
  return texto.replace(/(\$\s*)?(\d[\d.]*)/g, (todo, signo, numero) => {
    const cifras = numero.replace(/\./g, "");
    if (!signo && cifras.length < 3) return todo;
    return "$" + Number(cifras).toLocaleString("es-CL");
  });
}

$("#pr-precio").addEventListener("input", () => {
  const campo = $("#pr-precio");
  // Recordamos cuántas letras/cifras "reales" hay antes del cursor para dejarlo en el mismo lugar
  const antes = campo.value.slice(0, campo.selectionStart).replace(/[$.\s]/g, "").length;
  const nuevo = formatearPesos(campo.value);
  if (nuevo === campo.value) return;
  campo.value = nuevo;
  let posicion = 0;
  for (let contadas = 0; posicion < nuevo.length && contadas < antes; posicion++) {
    if (!/[$.\s]/.test(nuevo[posicion])) contadas++;
  }
  campo.setSelectionRange(posicion, posicion);
});

$("#product-new").addEventListener("click", () => abrirFormularioServicio());
$("#product-cancel").addEventListener("click", cerrarFormularioServicio);
alElegirImagen($("#pr-imagen"), TAMANOS.servicio, (url) => { imagenServicio = url; pintarImagenServicio(); });
$("#item-remove").addEventListener("click", () => { imagenServicio = ""; pintarImagenServicio(); });

$("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const boton = $("#product-submit");
  const datos = {
    emoji: $("#pr-emoji").value.trim(),
    nombre: $("#pr-nombre").value.trim(),
    precio: $("#pr-precio").value.trim(),
    descripcion: $("#pr-descripcion").value.trim(),
    categoria: $("#pr-categoria").value.trim(),
    duracion: $("#pr-duracion").value.trim(),
    destacado: $("#pr-destacado").checked,
    oculto: $("#pr-oculto").checked,
    imagen: imagenServicio
  };

  boton.disabled = true;
  try {
    if (editandoId) {
      await updateDoc(doc(productosRef(), editandoId), datos);
    } else {
      await addDoc(productosRef(), { ...datos, creado: serverTimestamp() });
    }
    cerrarFormularioServicio();
  } catch (error) {
    console.error(error);
    mostrarMensaje($("#product-message"), "No se pudo guardar. Inténtalo de nuevo.");
  } finally {
    boton.disabled = false;
  }
});

async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?`)) return;
  await deleteDoc(doc(productosRef(), id));
  if (editandoId === id) cerrarFormularioServicio();
}

// ---------- Galería de trabajos ----------
// Cada foto es un documento aparte (perfiles/{uid}/galeria) para no llenar el perfil, que tiene límite de 1 MB.

const MAX_FOTOS = 12;
let fotosGaleria = 0;

function galeriaRef() {
  return collection(db, "perfiles", usuario.uid, "galeria");
}

function escucharGaleria() {
  $("#gallery-card").hidden = false;
  let primeraVez = true;
  onSnapshot(query(galeriaRef(), orderBy("creado")), (snap) => {
    if (!primeraVez) refrescarVistaPreviaLuego();
    primeraVez = false;
    fotosGaleria = snap.size;
    const grilla = $("#gallery-grid");
    grilla.innerHTML = "";
    snap.docs.forEach((documento) => {
      const foto = document.createElement("div");
      foto.className = "gallery-item";
      pintarImagen(foto, documento.data().imagen);
      const quitar = Object.assign(document.createElement("button"), { type: "button", className: "gallery-remove", textContent: "✕" });
      quitar.setAttribute("aria-label", "Quitar esta foto");
      quitar.addEventListener("click", async () => {
        if (confirm("¿Quitar esta foto de tu página?")) await deleteDoc(documento.ref);
      });
      foto.append(quitar);
      grilla.append(foto);
    });
    $("#gallery-add").hidden = fotosGaleria >= MAX_FOTOS;
  }, (error) => {
    console.error(error);
    mostrarMensaje($("#gallery-message"), "No pudimos cargar tu galería. Revisa que las reglas de Firestore estén publicadas.");
  });
}

$("#g-imagenes").addEventListener("change", async () => {
  const input = $("#g-imagenes");
  const archivos = [...input.files].slice(0, MAX_FOTOS - fotosGaleria);
  input.value = "";
  const mensaje = $("#gallery-message");
  mostrarMensaje(mensaje, archivos.length ? "Subiendo fotos…" : "");
  try {
    for (const archivo of archivos) {
      const imagen = await comprimirImagen(archivo, TAMANOS.servicio);
      await addDoc(galeriaRef(), { imagen, creado: serverTimestamp() });
    }
    mostrarMensaje(mensaje, archivos.length ? "Fotos agregadas." : "", true);
  } catch (error) {
    console.error(error);
    mostrarMensaje(mensaje, "No pudimos subir una de las fotos. Prueba con otra en JPG o PNG.");
  }
});

// ---------- Agenda ----------

// Cada reserva tiene el mismo id que su hora ocupada: "2026-10-15_14-30"
const NOMBRES_MODALIDAD = { presencial: "🤝 Presencial", videollamada: "💻 Videollamada", llamada: "📞 Llamada" };

function escucharReservas() {
  const reservasRef = collection(db, "perfiles", usuario.uid, "reservas");
  // El id ya está en orden cronológico, así que basta con ordenar por id (sin índices extra)
  let primeraLectura = true; // las reservas que ya existían no se avisan
  onSnapshot(reservasRef, (snap) => {
    if (!primeraLectura) {
      snap.docChanges().filter((c) => c.type === "added").forEach((c) => avisarReserva(c.doc.data()));
    }
    primeraLectura = false;
    const lista = $("#booking-list");
    lista.innerHTML = "";
    const hoy = new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD
    const proximas = snap.docs.filter((d) => d.data().fecha >= hoy).sort((a, b) => a.id.localeCompare(b.id));
    if (proximas.length === 0) {
      lista.innerHTML = '<li class="panel-hint">No tienes reservas próximas.</li>';
      return;
    }
    proximas.forEach((documento) => {
      const r = documento.data();
      const fecha = new Date(`${r.fecha}T00:00`).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
      const item = document.createElement("li");
      item.className = "product-row";
      item.innerHTML = '<span class="product-thumb booking-time"></span><div class="product-row-info"><strong></strong><small class="row-tags"></small></div><div class="product-row-actions"><button class="link-button danger" type="button">Cancelar</button></div>';
      item.querySelector(".booking-time").textContent = r.hora;
      item.querySelector("strong").textContent = `${fecha} · ${r.nombre}`;
      item.querySelector(".row-tags").textContent = [NOMBRES_MODALIDAD[r.modalidad], r.servicio, r.nota].filter(Boolean).join(" · ");
      item.querySelector("button").addEventListener("click", () => cancelarReserva(documento.id, r));
      lista.append(item);
    });
  });
}

async function cancelarReserva(id, reserva) {
  if (!confirm(`¿Cancelar la reserva de ${reserva.nombre} (${reserva.fecha} ${reserva.hora})? Recuerda avisarle por WhatsApp.`)) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, "perfiles", usuario.uid, "reservas", id));
  batch.delete(doc(db, "perfiles", usuario.uid, "ocupados", id));
  await batch.commit();
}

// El enlace de videollamada solo tiene sentido si se ofrece videollamada
function mostrarCampoVideo() {
  $("#p-video-campo").hidden = !document.querySelector('#p-modalidades input[value="videollamada"]').checked;
}
document.querySelectorAll("#p-modalidades input").forEach((c) => c.addEventListener("change", mostrarCampoVideo));

// ---------- Avisos de reservas nuevas ----------
// Funcionan mientras el panel esté abierto (aunque sea en otra pestaña).
const puedeNotificar = "Notification" in window;
let reservasSinVer = 0;
const tituloOriginal = document.title;

function pintarEstadoAvisos() {
  const boton = $("#notif-activar");
  const estado = $("#notif-estado");
  if (!puedeNotificar) {
    boton.hidden = true;
    estado.textContent = "🔔 Te avisaremos aquí con un sonido cuando llegue una reserva nueva.";
  } else if (Notification.permission === "granted") {
    boton.hidden = true;
    estado.textContent = "🔔 Avisos activados: te avisamos cuando llegue una reserva nueva, mientras tengas el panel abierto.";
  } else if (Notification.permission === "denied") {
    boton.hidden = true;
    estado.textContent = "🔕 Bloqueaste los avisos en este navegador. Puedes permitirlos desde el candado junto a la dirección.";
  } else {
    boton.hidden = false;
    estado.textContent = "";
  }
}
pintarEstadoAvisos();

$("#notif-activar").addEventListener("click", async () => {
  await Notification.requestPermission();
  pintarEstadoAvisos();
});

// Un "ding" corto hecho con el navegador (sin archivos de audio)
function sonarAviso() {
  try {
    const audio = new AudioContext();
    [880, 1320].forEach((frecuencia, i) => {
      const nota = audio.createOscillator();
      const volumen = audio.createGain();
      nota.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(0.2, audio.currentTime + i * 0.15);
      volumen.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + i * 0.15 + 0.4);
      nota.connect(volumen).connect(audio.destination);
      nota.start(audio.currentTime + i * 0.15);
      nota.stop(audio.currentTime + i * 0.15 + 0.4);
    });
  } catch { /* algunos navegadores no dejan sonar sin un clic previo */ }
}

function avisarReserva(r) {
  const fecha = new Date(`${r.fecha}T00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const texto = `${r.nombre} reservó el ${fecha} a las ${r.hora}${r.modalidad ? ` · ${NOMBRES_MODALIDAD[r.modalidad]}` : ""}`;

  // Aviso dentro del panel
  const toast = $("#toast");
  toast.innerHTML = "<strong>📅 ¡Nueva reserva!</strong><span></span>";
  toast.querySelector("span").textContent = texto;
  toast.hidden = false;
  clearTimeout(toast.espera);
  toast.espera = setTimeout(() => { toast.hidden = true; }, 8000);
  sonarAviso();

  // Si estás en otra pestaña: aviso del sistema y contador en el título
  if (document.hidden) {
    reservasSinVer++;
    document.title = `(${reservasSinVer}) ${tituloOriginal}`;
    if (puedeNotificar && Notification.permission === "granted") {
      const aviso = new Notification("📅 ¡Nueva reserva!", { body: texto, icon: "apple-touch-icon.png" });
      aviso.onclick = () => { window.focus(); $("#bookings-card").scrollIntoView({ behavior: "smooth" }); aviso.close(); };
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { reservasSinVer = 0; document.title = tituloOriginal; }
});
