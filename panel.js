import { auth, db } from "./firebase.js";
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

// Enlaces que no se pueden usar porque chocan con páginas del sitio
const RESERVADOS = ["cuenta", "panel", "pagina", "index", "style", "app", "script", "firebase", "vercel"];

const $ = (selector) => document.querySelector(selector);

let usuario = null;           // usuario con sesión iniciada
let perfil = null;            // perfil guardado en Firestore (null si aún no existe)
let editandoId = null;        // id del producto que se está editando
let escuchandoProductos = false;
let slugEditado = false;      // true cuando la persona escribe su enlace a mano

function mostrarMensaje(elemento, texto, ok = false) {
  elemento.textContent = texto;
  elemento.classList.toggle("ok", ok);
}

// ---------- Sesión ----------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "cuenta.html?modo=entrar";
    return;
  }
  usuario = user;
  $("#user-email").textContent = user.email;

  const snap = await getDoc(doc(db, "perfiles", user.uid));
  if (snap.exists()) {
    perfil = snap.data();
    llenarPerfil();
    mostrarEnlace();
    activarProductos();
  }
  $("#panel").hidden = false;
});

$("#logout").addEventListener("click", () => signOut(auth));

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

function llenarPerfil() {
  $("#p-nombre").value = perfil.nombre;
  $("#p-descripcion").value = perfil.descripcion;
  $("#p-zona").value = perfil.zona || "";
  $("#p-whatsapp").value = "+" + perfil.whatsapp;
  $("#p-slug").value = perfil.slug;
  slugEditado = true;
}

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
    slug: crearSlug($("#p-slug").value)
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
    mostrarEnlace();
    activarProductos();
    mostrarMensaje(mensaje, "¡Perfil guardado!", true);
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
  $("#share-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(`Mira mi catálogo: ${url}`)}`;
  $("#share-box").hidden = false;
}

$("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#share-link").href);
  $("#copy-link").textContent = "¡Copiado!";
  setTimeout(() => { $("#copy-link").textContent = "Copiar enlace"; }, 2000);
});

// ---------- Productos ----------

function productosRef() {
  return collection(db, "perfiles", usuario.uid, "productos");
}

function activarProductos() {
  $("#products-locked").hidden = true;
  $("#product-form").hidden = false;
  if (escuchandoProductos) return;
  escuchandoProductos = true;
  // onSnapshot vuelve a dibujar la lista cada vez que algo cambia en Firestore
  onSnapshot(query(productosRef(), orderBy("creado")), (snap) => mostrarProductos(snap.docs));
}

function mostrarProductos(docs) {
  const lista = $("#product-list");
  lista.innerHTML = "";

  if (docs.length === 0) {
    lista.innerHTML = '<li class="panel-hint">Aún no has agregado nada.</li>';
    return;
  }

  docs.forEach((documento) => {
    const producto = documento.data();
    const item = $("#product-item").content.firstElementChild.cloneNode(true);
    item.querySelector("strong").textContent = `${producto.emoji || ""} ${producto.nombre}`.trim();
    item.querySelector("small").textContent = producto.precio;
    item.querySelector('[data-action="editar"]').addEventListener("click", () => editarProducto(documento.id, producto));
    item.querySelector('[data-action="eliminar"]').addEventListener("click", () => eliminarProducto(documento.id, producto.nombre));
    lista.append(item);
  });
}

$("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const boton = $("#product-submit");
  const datos = {
    emoji: $("#pr-emoji").value.trim(),
    nombre: $("#pr-nombre").value.trim(),
    precio: $("#pr-precio").value.trim(),
    descripcion: $("#pr-descripcion").value.trim()
  };

  boton.disabled = true;
  try {
    if (editandoId) {
      await updateDoc(doc(productosRef(), editandoId), datos);
    } else {
      await addDoc(productosRef(), { ...datos, creado: serverTimestamp() });
    }
    limpiarFormularioProducto();
  } catch (error) {
    console.error(error);
    mostrarMensaje($("#product-message"), "No se pudo guardar. Inténtalo de nuevo.");
  } finally {
    boton.disabled = false;
  }
});

function editarProducto(id, producto) {
  editandoId = id;
  $("#pr-emoji").value = producto.emoji || "";
  $("#pr-nombre").value = producto.nombre;
  $("#pr-precio").value = producto.precio;
  $("#pr-descripcion").value = producto.descripcion;
  $("#product-submit").textContent = "Guardar cambios";
  $("#product-cancel").hidden = false;
  $("#pr-nombre").focus();
}

function limpiarFormularioProducto() {
  editandoId = null;
  $("#product-form").reset();
  $("#product-submit").textContent = "Agregar";
  $("#product-cancel").hidden = true;
  mostrarMensaje($("#product-message"), "");
}

$("#product-cancel").addEventListener("click", limpiarFormularioProducto);

async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?`)) return;
  await deleteDoc(doc(productosRef(), id));
  if (editandoId === id) limpiarFormularioProducto();
}
