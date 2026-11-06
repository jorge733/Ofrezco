const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { firmarFlow, crearFlow, crearProveedor } = require("../tienda/flow");
const { decidirCompra, compraVencida } = require("../tienda/compras");
const { CATALOGO } = require("../tienda/catalogo");

const flowCon = (fetchFalso) => crearFlow({ modo: "flow-sandbox", apiKey: "K", secreto: "S", fetch: fetchFalso });
const compra = { uid: "u1", funcion: "quitarMarca", monto: 14990, estado: "pendiente", creado: 0 };
const pagado = { estado: "pagado", monto: 14990, flowOrder: "7" };

test("firma de Flow: parámetros ordenados, nombre+valor, HMAC-SHA256", () => {
  const esperada = crypto.createHmac("sha256", "secreto").update("a1apiKeyKb2").digest("hex");
  assert.equal(firmarFlow({ b: "2", apiKey: "K", a: "1" }, "secreto"), esperada);
});

test("crear un pago: va firmado, con los datos correctos y devuelve la dirección con el token", async () => {
  const llamadas = [];
  const flow = flowCon(async (url, opciones) => {
    llamadas.push({ url, cuerpo: opciones.body.toString() });
    return { ok: true, json: async () => ({ url: "https://flow/pagar", token: "abc", flowOrder: 9 }) };
  });
  const r = await flow.crearPago({ orden: "o1", asunto: "Quitar marca", monto: 14990, correo: "a@b.cl", urlConfirmacion: "https://c", urlRetorno: "https://r", segundosParaPagar: 3600 });
  assert.equal(r.url, "https://flow/pagar?token=abc");
  assert.equal(llamadas[0].url, "https://sandbox.flow.cl/api/payment/create");
  const params = Object.fromEntries(new URLSearchParams(llamadas[0].cuerpo));
  assert.equal(params.amount, "14990");
  assert.equal(params.currency, "CLP");
  assert.equal(params.commerceOrder, "o1");
  assert.equal(params.urlConfirmation, "https://c");
  const { s, ...resto } = params;
  assert.equal(s, firmarFlow(resto, "S"));
});

test("cada estado de pago se interpreta como dice la documentación de Flow", async () => {
  const estadoCon = async (status) => (await flowCon(async () => ({ ok: true, json: async () => ({ status, amount: "14990.0000", commerceOrder: "o1" }) })).pagoPorToken("t")).estado;
  assert.equal(await estadoCon(1), "pendiente");
  assert.equal(await estadoCon(2), "pagado");
  assert.equal(await estadoCon(3), "rechazado");
  assert.equal(await estadoCon(4), "rechazado");
  assert.equal(await estadoCon(99), "pendiente"); // lo desconocido nunca activa ni rechaza
});

test("el monto de Flow se entiende aunque venga como texto con decimales", async () => {
  const pago = await flowCon(async () => ({ ok: true, json: async () => ({ status: 2, amount: "14990.0000", commerceOrder: "o1" }) })).pagoPorToken("t");
  assert.equal(pago.monto, 14990);
  assert.equal(decidirCompra({ compra, pago }).accion, "activar");
});

test("consultar una orden: si Flow no la conoce lo informa; si no contesta, avisa del error", async () => {
  const noExiste = await flowCon(async () => ({ ok: false, status: 400, json: async () => ({ message: "no existe" }) })).pagoPorOrden("o1");
  assert.equal(noExiste.estado, "no_existe");
  await assert.rejects(flowCon(async () => { throw new Error("sin internet"); }).pagoPorOrden("o1"), /sin respuesta/);
  await assert.rejects(flowCon(async () => ({ ok: false, status: 500, json: async () => { throw new Error("no es JSON"); } })).pagoPorOrden("o1"));
});

test("sin aprobación no hay cobros reales, y sin configurar no hay pagos", () => {
  assert.throws(() => crearProveedor({}), /no están activados/);
  assert.throws(() => crearProveedor({ PAGOS_MODO: "flow-produccion", FLOW_API_KEY: "k", FLOW_SECRET: "s" }), /bloqueados/);
  assert.throws(() => crearProveedor({ PAGOS_MODO: "flow-produccion", COBROS_REALES_APROBADOS: "si" }), /Faltan/);
  assert.ok(crearProveedor({ PAGOS_MODO: "flow-produccion", COBROS_REALES_APROBADOS: "si", FLOW_API_KEY: "k", FLOW_SECRET: "s" }));
  assert.ok(crearProveedor({ PAGOS_MODO: "flow-sandbox", FLOW_API_KEY: "k", FLOW_SECRET: "s" }));
});

test("un pago confirmado activa la función", () => {
  assert.deepEqual(decidirCompra({ compra, pago: pagado }), { accion: "activar" });
});

test("un aviso repetido de Flow no hace nada dos veces", () => {
  assert.equal(decidirCompra({ compra: { ...compra, estado: "pagado" }, pago: pagado }).accion, "nada");
});

test("pendiente no activa; rechazado se marca; y un pago posterior aún puede activarse", () => {
  assert.equal(decidirCompra({ compra, pago: { estado: "pendiente" } }).accion, "nada");
  assert.deepEqual(decidirCompra({ compra, pago: { estado: "rechazado" } }), { accion: "marcar", estado: "rechazado" });
  assert.equal(decidirCompra({ compra: { ...compra, estado: "rechazado" }, pago: { estado: "rechazado" } }).accion, "nada");
  assert.equal(decidirCompra({ compra: { ...compra, estado: "rechazado" }, pago: pagado }).accion, "activar");
});

test("un monto distinto no activa nada: queda para revisión", () => {
  const r = decidirCompra({ compra, pago: { ...pagado, monto: 100 } });
  assert.equal(r.estado, "revisar");
});

test("pagar dos veces la misma función queda marcado para devolver", () => {
  const r = decidirCompra({ compra, pago: pagado, funcionesDelNegocio: ["quitarMarca"] });
  assert.equal(r.estado, "duplicada");
});

test("una compra vence si Flow no la conoce tras una hora, o si sigue pendiente tras 7 días", () => {
  const hora = 60 * 60 * 1000;
  assert.equal(compraVencida(compra, { estado: "no_existe" }, hora / 2), false);
  assert.equal(compraVencida(compra, { estado: "no_existe" }, hora * 2), true);
  assert.equal(compraVencida(compra, { estado: "pendiente" }, hora * 24 * 6), false);
  assert.equal(compraVencida(compra, { estado: "pendiente" }, hora * 24 * 8), true);
  assert.equal(compraVencida(compra, { estado: "pagado" }, hora * 24 * 30), false);
});

test("los precios del panel coinciden con los del servidor, y solo lo construido se puede comprar", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "..", "tienda.js"), "utf8");
  for (const [id, producto] of Object.entries(CATALOGO)) {
    const fila = panel.match(new RegExp(`id: "${id}"[^\\n]*`));
    assert.ok(fila, `Falta ${id} en tienda.js`);
    assert.match(fila[0], new RegExp(`precio: ${producto.precio}\\b`));
    assert.match(fila[0], new RegExp(`disponible: ${producto.disponible}\\b`));
  }
  assert.deepEqual(Object.keys(CATALOGO).filter((id) => CATALOGO[id].disponible), ["quitarMarca"]);
});
