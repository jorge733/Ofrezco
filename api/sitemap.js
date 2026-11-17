// Mapa del sitio para Google (serviceplanet.cl/sitemap.xml).
// Se arma solo: además de las páginas fijas, incluye la página de cada negocio que tenga nombre,
// así Google descubre los negocios nuevos sin que tengamos que agregarlos a mano.
const SITIO = "https://www.serviceplanet.cl";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/ofrezco-2583a/databases/(default)/documents";
const API_KEY = "AIzaSyAOvR56ulZrHsd9FBJmCmSUYCNBJIAuRKI";

const FIJAS = [
  { ruta: "/", prioridad: "1.0" },
  { ruta: "/contacto", prioridad: "0.4" },
  { ruta: "/terminos", prioridad: "0.2" },
  { ruta: "/privacidad", prioridad: "0.2" }
];

// Lee una colección completa, de a 300 documentos, trayendo solo los campos pedidos
async function listar(coleccion, campos) {
  const mascara = campos.map((c) => `&mask.fieldPaths=${c}`).join("");
  const documentos = [];
  let pagina = "";
  do {
    const respuesta = await fetch(`${FIRESTORE}/${coleccion}?key=${API_KEY}&pageSize=300${mascara}${pagina ? `&pageToken=${pagina}` : ""}`);
    if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}`);
    const datos = await respuesta.json();
    documentos.push(...(datos.documents || []));
    pagina = datos.nextPageToken || "";
  } while (pagina && documentos.length < 45000);
  return documentos;
}

const fecha = (texto) => (texto || "").slice(0, 10);

module.exports = async (req, res) => {
  const urls = FIJAS.map((p) => `<url><loc>${SITIO}${p.ruta}</loc><priority>${p.prioridad}</priority></url>`);

  try {
    const [slugs, perfiles] = await Promise.all([listar("slugs", ["uid"]), listar("perfiles", ["nombre"])]);
    // uid → fecha de la última edición, solo de perfiles que tienen nombre (los vacíos no sirven en Google)
    const conNombre = new Map(
      perfiles
        .filter((d) => d.fields?.nombre?.stringValue?.trim())
        .map((d) => [d.name.split("/").pop(), fecha(d.updateTime)])
    );
    for (const d of slugs) {
      const slug = d.name.split("/").pop();
      const uid = d.fields?.uid?.stringValue;
      if (!/^[a-z0-9-]{3,40}$/.test(slug) || !conNombre.has(uid)) continue;
      urls.push(`<url><loc>${SITIO}/${slug}</loc><lastmod>${conNombre.get(uid)}</lastmod><priority>0.6</priority></url>`);
    }
  } catch (error) {
    // Si Firestore falla, igual entregamos las páginas fijas
    console.error(error);
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Vercel lo guarda 1 hora
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join("\n  ")}
</urlset>`);
};
