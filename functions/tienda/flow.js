// Conexión con Flow para pagos únicos. Documentación: https://developers.flow.cl/api
const crypto = require("crypto");

const URLS_FLOW = {
  "flow-sandbox": "https://sandbox.flow.cl/api",
  "flow-produccion": "https://www.flow.cl/api"
};

// Flow firma cada llamada: parámetros ordenados por nombre, concatenados "nombrevalor" y HMAC-SHA256 con la clave secreta
function firmarFlow(parametros, secreto) {
  const texto = Object.keys(parametros).sort().map((clave) => `${clave}${parametros[clave]}`).join("");
  return crypto.createHmac("sha256", secreto).update(texto).digest("hex");
}

// Estado de un pago en Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
// Un estado desconocido cuenta como pendiente: nunca se activa ni se rechaza algo sin saber qué pasó.
function estadoDePago(status) {
  const n = Number(status);
  if (n === 2) return "pagado";
  if (n === 3 || n === 4) return "rechazado";
  return "pendiente";
}

// "respondio": Flow contestó con un error claro (400 o 401). Si no contestó, no sabemos qué pasó.
class ErrorFlow extends Error {
  constructor(mensaje, respondio) {
    super(mensaje);
    this.respondio = respondio;
  }
}

function crearFlow({ modo, apiKey, secreto, fetch: fetchFn = fetch }) {
  if (!apiKey || !secreto) throw new Error("Faltan FLOW_API_KEY y FLOW_SECRET en functions/.env");
  const base = URLS_FLOW[modo];

  async function llamar(metodo, ruta, datos) {
    const parametros = { apiKey, ...datos };
    parametros.s = firmarFlow(parametros, secreto);
    const cuerpo = new URLSearchParams(parametros);
    const limite = AbortSignal.timeout(20000);
    let respuesta;
    try {
      respuesta = metodo === "GET"
        ? await fetchFn(`${base}${ruta}?${cuerpo}`, { signal: limite })
        : await fetchFn(`${base}${ruta}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo, signal: limite });
    } catch (error) {
      throw new ErrorFlow(`Flow ${ruta}: sin respuesta (${error.message})`, false);
    }
    const json = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new ErrorFlow(`Flow ${ruta}: ${json.message || respuesta.status}`, respuesta.status < 500);
    return json;
  }

  const leerPago = (r) => ({
    estado: estadoDePago(r.status),
    orden: String(r.commerceOrder || ""),
    monto: Number(r.amount),
    flowOrder: String(r.flowOrder || "")
  });

  return {
    async crearPago({ orden, asunto, monto, correo, urlConfirmacion, urlRetorno, segundosParaPagar }) {
      const r = await llamar("POST", "/payment/create", {
        commerceOrder: orden, subject: asunto, currency: "CLP", amount: monto, email: correo,
        paymentMethod: 9, urlConfirmation: urlConfirmacion, urlReturn: urlRetorno, timeout: segundosParaPagar
      });
      return { url: `${r.url}?token=${r.token}`, flowOrder: String(r.flowOrder || "") };
    },
    async pagoPorToken(token) {
      return leerPago(await llamar("GET", "/payment/getStatus", { token }));
    },
    async pagoPorOrden(orden) {
      try {
        return leerPago(await llamar("GET", "/payment/getStatusByCommerceId", { commerceId: orden }));
      } catch (error) {
        if (error.respondio) return { estado: "no_existe", orden, monto: 0, flowOrder: "" };
        throw error;
      }
    }
  };
}

// Sin PAGOS_MODO no hay pagos. El dinero real exige además una aprobación explícita en functions/.env.
function crearProveedor(entorno = process.env, fetchFn) {
  const modo = entorno.PAGOS_MODO;
  if (!URLS_FLOW[modo]) throw new Error("Los pagos no están activados: revisa PAGOS_MODO en functions/.env.");
  if (modo === "flow-produccion" && entorno.COBROS_REALES_APROBADOS !== "si") {
    throw new Error("Cobros reales bloqueados: falta COBROS_REALES_APROBADOS=si en functions/.env.");
  }
  return crearFlow({ modo, apiKey: entorno.FLOW_API_KEY, secreto: entorno.FLOW_SECRET, ...(fetchFn ? { fetch: fetchFn } : {}) });
}

module.exports = { firmarFlow, estadoDePago, crearFlow, crearProveedor };
