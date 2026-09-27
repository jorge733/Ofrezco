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
const RESERVADOS = ["cuenta", "panel", "pagina", "index", "style", "app", "script", "firebase", "vercel", "logo", "imagenes"];

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
  imagenesPerfil = { logo: perfil?.logo || "", portada: perfil?.portada || "" };
  pintarImagenesPerfil();
  mostrarMensaje($("#profile-message"), "");

  $("#profile-view").hidden = true;
  $("#profile-form").hidden = false;
  $("#profile-edit").hidden = true;
  $("#profile-cancel").hidden = !perfil; // sin perfil no hay nada a qué volver
}

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
    portada: imagenesPerfil.portada
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
}

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
  if (escuchandoProductos) return;
  escuchandoProductos = true;
  // onSnapshot vuelve a dibujar la lista cada vez que algo cambia en Firestore
  onSnapshot(query(productosRef(), orderBy("creado")), (snap) => mostrarProductos(snap.docs));
}

function mostrarProductos(docs) {
  const lista = $("#product-list");
  lista.innerHTML = "";

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
  imagenServicio = producto.imagen || "";
  pintarImagenServicio();
  $("#product-form-title").textContent = id ? "Editar servicio" : "Nuevo servicio";
  $("#product-submit").textContent = id ? "Guardar cambios" : "Agregar servicio";
  mostrarMensaje($("#product-message"), "");

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
