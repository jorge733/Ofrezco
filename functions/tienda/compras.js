// Qué hacer con una compra cuando Flow informa cómo va su pago. Función pura: no toca la base de datos.
const DIA = 24 * 60 * 60 * 1000;

// Estados que ya no cambian. Una compra rechazada o vencida sí puede pasar a pagada si Flow lo informa después.
const FINALES = ["pagado", "duplicada", "revisar"];

function decidirCompra({ compra, pago, funcionesDelNegocio = [] }) {
  if (FINALES.includes(compra.estado)) return { accion: "nada" };
  if (pago.estado === "pendiente") return { accion: "nada" };
  if (pago.estado === "rechazado") return compra.estado === "rechazado" ? { accion: "nada" } : { accion: "marcar", estado: "rechazado" };
  if (pago.estado !== "pagado") return { accion: "nada" };

  // Lo que dice Flow debe calzar con lo que se pidió; si no, una persona lo revisa.
  if (pago.monto !== compra.monto) return { accion: "marcar", estado: "revisar", motivo: `Flow informó ${pago.monto} y la compra era por ${compra.monto}` };
  // Pagó dos veces (por ejemplo, con dos pestañas abiertas): se deja marcado para devolverle el dinero.
  if (funcionesDelNegocio.includes(compra.funcion)) return { accion: "marcar", estado: "duplicada", motivo: "El negocio ya tenía esta función" };
  return { accion: "activar" };
}

// Una compra que sigue pendiente en nuestra base y que Flow no conoce, o que quedó abierta demasiado tiempo
function compraVencida(compra, pago, ahora) {
  const edad = ahora - compra.creado;
  if (pago.estado === "no_existe") return edad > DIA / 24;
  return pago.estado === "pendiente" && edad > 7 * DIA;
}

module.exports = { decidirCompra, compraVencida };
