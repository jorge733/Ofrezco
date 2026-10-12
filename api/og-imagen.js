// Foto de vista previa de cada negocio (la que sale al compartir su enlace por WhatsApp, Facebook…).
// Las fotos están guardadas como texto (data URL) en Firestore; aquí las convertimos en una imagen
// normal. Usa la portada, si no hay usa el logo, y si no hay ninguna, la imagen general de ServicePlanet.
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/ofrezco-2583a/databases/(default)/documents";
const API_KEY = "AIzaSyAOvR56ulZrHsd9FBJmCmSUYCNBJIAuRKI";

async function leerCampo(ruta, campos) {
  const mascara = campos.map((c) => `&mask.fieldPaths=${c}`).join("");
  const respuesta = await fetch(`${FIRESTORE}/${ruta}?key=${API_KEY}${mascara}`);
  if (!respuesta.ok) return {};
  const { fields = {} } = await respuesta.json();
  return Object.fromEntries(Object.entries(fields).map(([campo, valor]) => [campo, valor.stringValue || ""]));
}

module.exports = async (req, res) => {
  const slug = String(req.query.slug || "").toLowerCase();
  try {
    if (/^[a-z0-9-]{3,40}$/.test(slug)) {
      const { uid } = await leerCampo(`slugs/${slug}`, ["uid"]);
      if (uid) {
        const { portada, logo } = await leerCampo(`perfiles/${uid}`, ["portada", "logo"]);
        const partes = (portada || logo || "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (partes) {
          res.setHeader("Content-Type", partes[1]);
          // La URL lleva ?v=… y cambia cuando el negocio edita su perfil, así que se puede guardar harto tiempo
          res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
          return res.status(200).send(Buffer.from(partes[2], "base64"));
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.redirect(302, "/og-image.png");
};
