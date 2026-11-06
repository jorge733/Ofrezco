// Las funciones que se venden en la tienda del panel. Se pagan una sola vez.
// Si cambias un precio, cámbialo aquí y en tienda.js (el panel). Los tests avisan si no coinciden.
// "disponible: false" se ve como "Próximamente" y no se puede comprar: nadie paga por algo que aún no existe.
const CATALOGO = {
  quitarMarca: { nombre: "Quitar la marca ServicePlanet", precio: 14990, disponible: true },
  estadisticas: { nombre: "Estadísticas de visitas", precio: 12990, disponible: false },
  portadaImpacto: { nombre: "Diseño Portada de impacto", precio: 9990, disponible: false }
};

module.exports = { CATALOGO };
