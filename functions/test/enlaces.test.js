const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");
const leer = (archivo) => fs.readFileSync(path.join(raiz, archivo), "utf8");

test("los enlaces reservados son los mismos en el panel y en las reglas", () => {
  const panel = leer("panel.js").match(/const RESERVADOS = \[([^\]]*)\]/)[1].match(/"[^"]+"/g).map((x) => x.slice(1, -1));
  const reglas = leer("firestore.rules").match(/function enlacesReservados\(\) \{\s*return \[([^\]]*)\]/)[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(reglas, panel);
});

test("todas las páginas del sitio están reservadas", () => {
  const panel = leer("panel.js").match(/const RESERVADOS = \[([^\]]*)\]/)[1];
  const paginas = fs.readdirSync(raiz).filter((f) => f.endsWith(".html")).map((f) => f.replace(".html", ""));
  assert.ok(paginas.length > 0);
  for (const pagina of paginas) assert.ok(panel.includes(`"${pagina}"`), `Falta reservar ${pagina}`);
});
