// Función de Vercel para las páginas de cada negocio (serviceplanet.cl/su-enlace).
// WhatsApp, Facebook y Google no ejecutan JavaScript al mirar un enlace, así que aquí
// leemos el negocio en Firestore y escribimos su nombre, descripción y foto en el HTML
// antes de enviarlo. El resto de la página la sigue armando pagina.js en el navegador.
const fs = require("fs");
const path = require("path");

const SITIO = "https://www.serviceplanet.cl";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/ofrezco-2583a/databases/(default)/documents";
const API_KEY = "AIzaSyAOvR56ulZrHsd9FBJmCmSUYCNBJIAuRKI";
const plantilla = fs.readFileSync(path.join(process.cwd(), "pagina.html"), "utf8");

// Evita que un nombre con < o " rompa el HTML
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const recortar = (texto, max) => (texto.length > max ? texto.slice(0, max - 1).trimEnd() + "…" : texto);

// Lee un documento público de Firestore. "campos" limita lo que se descarga (las fotos pesan mucho).
async function leer(ruta, campos) {
  const mascara = campos.map((c) => `&mask.fieldPaths=${c}`).join("");
  const respuesta = await fetch(`${FIRESTORE}/${ruta}?key=${API_KEY}${mascara}`);
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}`);
  const documento = await respuesta.json();
  const datos = { actualizado: documento.updateTime };
  for (const [campo, valor] of Object.entries(documento.fields || {})) datos[campo] = valor.stringValue ?? "";
  return datos;
}

async function buscarNegocio(slug) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const enlace = await leer(`slugs/${slug}`, ["uid"]);
  if (!enlace?.uid) return null;
  const negocio = await leer(`perfiles/${enlace.uid}`, ["nombre", "descripcion", "zona", "whatsapp"]);
  if (negocio) negocio.productos = await leerProductos(enlace.uid);
  return negocio;
}

// Servicios del negocio (solo texto, sin fotos), para contárselos a Google
async function leerProductos(uid) {
  try {
    const mascara = ["nombre", "precio", "descripcion"].map((c) => `&mask.fieldPaths=${c}`).join("");
    const respuesta = await fetch(`${FIRESTORE}/perfiles/${uid}/productos?key=${API_KEY}&pageSize=100${mascara}`);
    if (!respuesta.ok) return [];
    const { documents = [] } = await respuesta.json();
    return documents
      .map(({ fields = {} }) => Object.fromEntries(Object.entries(fields).map(([c, v]) => [c, v.stringValue ?? ""])))
      .filter((p) => p.nombre);
  } catch {
    return [];
  }
}

// "$5.000 la hora" → 5000 (null si no hay número, ej: "A convenir")
function precioNumero(texto = "") {
  const encontrado = String(texto).match(/\d[\d.]*/);
  return encontrado ? Number(encontrado[0].replace(/\./g, "")) : null;
}

// Título para Google: "Nombre — Zona | ServicePlanet"
const tituloDe = (negocio) => `${negocio.nombre}${negocio.zona ? ` — ${negocio.zona}` : ""} | ServicePlanet`;

// Datos estructurados (schema.org): le dicen a Google qué es el negocio, dónde atiende y qué ofrece
function datosEstructurados(url, negocio, descripcion, imagen) {
  const datos = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#negocio`,
    name: negocio.nombre,
    description: descripcion,
    url,
    image: imagen
  };
  if (negocio.zona) datos.areaServed = negocio.zona;
  if (/^\d{8,15}$/.test(negocio.whatsapp || "")) datos.telephone = `+${negocio.whatsapp}`;
  if (negocio.productos?.length) {
    datos.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: `Servicios de ${negocio.nombre}`,
      itemListElement: negocio.productos.slice(0, 50).map((p) => {
        const oferta = {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: p.nombre, ...(p.descripcion ? { description: recortar(p.descripcion, 300) } : {}) }
        };
        const precio = precioNumero(p.precio);
        if (precio) Object.assign(oferta, { price: precio, priceCurrency: "CLP" });
        return oferta;
      })
    };
  }
  // "<" escapado para que ningún texto pueda cerrar la etiqueta <script>
  return `<script type="application/ld+json">${JSON.stringify(datos).replace(/</g, String.raw`\u003c`)}</script>`;
}

function etiquetas(slug, negocio) {
  const url = `${SITIO}/${slug}`;
  const titulo = tituloDe(negocio);
  const descripcion = recortar(
    (negocio.descripcion || "").replace(/\s+/g, " ").trim() ||
      `Mira los servicios y precios de ${negocio.nombre}${negocio.zona ? ` en ${negocio.zona}` : ""} y escríbele directo por WhatsApp.`,
    160
  );
  // La versión cambia cuando el negocio edita su perfil, así WhatsApp no muestra una foto vieja
  const version = Date.parse(negocio.actualizado || "") || 0;
  const imagen = `${SITIO}/api/og-imagen?slug=${slug}&v=${version.toString(36)}`;
  return [
    `<meta name="description" content="${escapar(descripcion)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="ServicePlanet">`,
    `<meta property="og:locale" content="es_CL">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${escapar(negocio.nombre)}">`,
    `<meta property="og:description" content="${escapar(descripcion)}">`,
    `<meta property="og:image" content="${imagen}">`,
    `<meta property="og:image:alt" content="${escapar(negocio.nombre)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapar(titulo)}">`,
    `<meta name="twitter:description" content="${escapar(descripcion)}">`,
    `<meta name="twitter:image" content="${imagen}">`,
    datosEstructurados(url, negocio, descripcion, imagen)
  ].join("\n  ");
}

module.exports = async (req, res) => {
  const slug = String(req.query.slug || "").toLowerCase();
  let html = plantilla;
  let estado = 200;

  try {
    const negocio = await buscarNegocio(slug);
    if (negocio?.nombre) {
      html = html
        .replace(/<title>.*?<\/title>/, () => `<title>${escapar(tituloDe(negocio))}</title>`)
        .replace(/<!-- og:inicio -->[\s\S]*?<!-- og:fin -->/, () => etiquetas(slug, negocio)); // con () => un "$" en el texto no se interpreta
    } else {
      estado = 404; // pagina.js muestra el aviso de "página no encontrada"
      html = html.replace("<!-- og:inicio -->", '<meta name="robots" content="noindex">\n  <!-- og:inicio -->');
    }
  } catch (error) {
    // Si Firestore falla, igual enviamos la página: pagina.js la carga en el navegador
    console.error(error);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Vercel la guarda 5 minutos; después la renueva sin hacer esperar a nadie
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  res.status(estado).send(html);
};
