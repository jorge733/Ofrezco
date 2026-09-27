import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const COLORES = ["#ffe5d8", "#e9e0ff", "#dff5e8", "#fff1c9", "#e3edff"];
const $ = (selector) => document.querySelector(selector);

// Lee el enlace desde ofrezco.cl/maria-pasteleria (Vercel) o pagina.html?u=maria-pasteleria (local)
function obtenerSlug() {
  const desdeParametro = new URLSearchParams(location.search).get("u");
  if (desdeParametro) return desdeParametro.toLowerCase();
  const ultimo = location.pathname.split("/").filter(Boolean).pop() || "";
  return ultimo.includes(".") || ultimo === "pagina" ? "" : ultimo.toLowerCase();
}

function noEncontrado() {
  $("#estado").innerHTML = 'Esta página no existe. <a class="link-button" href="index.html">Ir a Ofrezco</a>';
}

async function cargar() {
  const slug = obtenerSlug();
  if (!slug) return noEncontrado();

  try {
    // 1) El enlace nos dice de quién es la página
    const slugSnap = await getDoc(doc(db, "slugs", slug));
    if (!slugSnap.exists()) return noEncontrado();
    const uid = slugSnap.data().uid;

    // 2) Con eso cargamos el perfil y los productos
    const [perfilSnap, productosSnap] = await Promise.all([
      getDoc(doc(db, "perfiles", uid)),
      getDocs(query(collection(db, "perfiles", uid, "productos"), orderBy("creado")))
    ]);
    if (!perfilSnap.exists()) return noEncontrado();

    mostrar(perfilSnap.data(), productosSnap.docs.map((d) => d.data()));
  } catch (error) {
    console.error(error);
    $("#estado").textContent = "No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.";
  }
}

function mostrar(perfil, productos) {
  document.title = `${perfil.nombre} — Ofrezco`;
  $("#c-avatar").textContent = perfil.nombre.charAt(0).toUpperCase();
  $("#c-nombre").textContent = perfil.nombre;
  $("#c-descripcion").textContent = perfil.descripcion;
  $("#c-zona").textContent = perfil.zona || "";

  const whatsapp = $("#c-whatsapp");
  const prepararWhatsapp = (texto) => {
    whatsapp.href = `https://wa.me/${perfil.whatsapp}?text=${encodeURIComponent(texto)}`;
  };
  prepararWhatsapp(`Hola ${perfil.nombre}, vi tu catálogo en Ofrezco y quiero hacer una consulta.`);

  const lista = $("#c-productos");
  if (productos.length === 0) {
    lista.innerHTML = '<p class="catalog-empty">Pronto habrá novedades aquí.</p>';
  }

  productos.forEach((producto, i) => {
    const boton = $("#producto-molde").content.firstElementChild.cloneNode(true);
    const imagen = boton.querySelector(".product-image");
    imagen.textContent = producto.emoji || producto.nombre.charAt(0).toUpperCase();
    imagen.style.background = COLORES[i % COLORES.length];
    boton.querySelector("strong").textContent = producto.nombre;
    boton.querySelector("small").textContent = producto.precio;
    boton.querySelector(".product-desc").textContent = producto.descripcion;

    // Al tocar un producto, el botón de WhatsApp pregunta por ese producto
    boton.addEventListener("click", () => {
      lista.querySelectorAll(".product.selected").forEach((b) => b.classList.remove("selected"));
      boton.classList.add("selected");
      const precio = producto.precio ? ` (${producto.precio})` : "";
      prepararWhatsapp(`Hola ${perfil.nombre}, quiero consultar por ${producto.nombre}${precio}.`);
      $("#c-whatsapp-texto").textContent = `Consultar por ${producto.nombre}`;
    });

    lista.append(boton);
  });

  $("#estado").hidden = true;
  $("#catalogo").hidden = false;
}

cargar();
