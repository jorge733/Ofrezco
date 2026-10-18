// Ejemplos que muestra la tarjeta de la portada. Para agregar otro, copia uno y agrega su pestaña en index.html.
// "demo" es el enlace a una página real de ejemplo (por ejemplo "/maria-pasteleria").
// TODO: hoy no existe ninguna página demo. Crea una cuenta de ejemplo en el panel con ese enlace
// y escribe aquí su dirección: "Ver un ejemplo" y el botón verde de la tarjeta pasarán a abrirla.
// Mientras "demo" esté vacío, el botón verde se muestra como ejemplo y no abre nada.
const examples = {
  pasteleria: {
    name: "María Pastelería",
    zone: "Pedidos en Santiago",
    demo: "",
    intro: "Tortas y dulces hechos por encargo para celebrar lo que quieras.",
    items: [
      { emoji: "🍰", name: "Torta tres leches", price: "Desde $24.000" },
      { emoji: "🧁", name: "Caja de brownies", price: "$8.000" }
    ]
  },
  bicicletas: {
    name: "Rueda Libre",
    zone: "Arriendo en Puerto Varas",
    demo: "",
    intro: "Bicicletas y cascos para recorrer el lago a tu ritmo.",
    items: [
      { emoji: "🚲", name: "Bicicleta urbana", price: "$5.000 la hora" },
      { emoji: "🚵", name: "Mountain bike por el día", price: "$18.000" }
    ]
  },
  clases: {
    name: "Guitarra con Camila",
    zone: "Online o en Ñuñoa",
    demo: "",
    intro: "Clases de guitarra para principiantes, niños y adultos.",
    items: [
      { emoji: "🎸", name: "Clase individual (60 min)", price: "$15.000" },
      { emoji: "🎶", name: "Pack de 4 clases", price: "$52.000" }
    ]
  }
};

const colors = ["#ffe5d8", "#e9e0ff", "#dff5e8"];
const tabs = document.querySelectorAll(".example-tab");
const itemsList = document.querySelector("#example-items");
const whatsappLink = document.querySelector("#whatsapp-link");
const whatsappText = document.querySelector("#whatsapp-text");
const whatsappTag = document.querySelector("#whatsapp-tag");

// Si el ejemplo tiene página demo, el botón la abre; si no, queda como muestra (sin enlace)
function setWhatsapp(example, label) {
  whatsappText.textContent = label;
  if (example.demo) {
    whatsappLink.href = example.demo;
    whatsappLink.target = "_blank";
    whatsappLink.rel = "noopener";
    whatsappLink.removeAttribute("aria-disabled");
    whatsappLink.classList.remove("is-sample");
    whatsappTag.textContent = "Ver página ↗";
  } else {
    whatsappLink.removeAttribute("href");
    whatsappLink.setAttribute("aria-disabled", "true");
    whatsappLink.classList.add("is-sample");
    whatsappTag.textContent = "Ejemplo";
  }
}

// "Ver un ejemplo" abre la página demo de la pastelería cuando exista; si no, baja a la tarjeta
if (examples.pasteleria.demo) document.querySelector("#ver-ejemplo").href = examples.pasteleria.demo;

function showExample(key) {
  const example = examples[key];
  document.querySelector("#example-avatar").textContent = example.name.charAt(0);
  document.querySelector("#example-name").textContent = example.name;
  document.querySelector("#example-zone").textContent = example.zone;
  document.querySelector("#example-intro").textContent = example.intro;
  setWhatsapp(example, "Consultar por WhatsApp");

  itemsList.innerHTML = "";
  example.items.forEach((item, i) => {
    const button = document.createElement("button");
    button.className = "product";
    button.type = "button";
    button.innerHTML = `
      <span class="product-image" aria-hidden="true"></span>
      <span class="product-info"><strong></strong><small></small></span>
      <span class="product-arrow" aria-hidden="true">›</span>`;
    button.querySelector(".product-image").textContent = item.emoji;
    button.querySelector(".product-image").style.background = colors[i % colors.length];
    button.querySelector("strong").textContent = item.name;
    button.querySelector("small").textContent = item.price;
    button.addEventListener("click", () => {
      setWhatsapp(example, `Consultar por ${item.name}`);
    });
    itemsList.append(button);
  });

  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.example === key));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showExample(tab.dataset.example));
});

showExample("pasteleria");

// Botón fijo en celular: aparece cuando el botón de la portada sale por arriba de la pantalla
// y se esconde mientras se ve cualquier otro botón "Crear mi página gratis" (para no repetirlo).
const stickyCta = document.querySelector("#sticky-cta");
const heroCta = document.querySelector("#hero-cta");
if (stickyCta && heroCta && "IntersectionObserver" in window) {
  const ctasEnPantalla = new Set();
  let heroPasado = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) ctasEnPantalla.add(entry.target);
      else ctasEnPantalla.delete(entry.target);
      if (entry.target === heroCta) heroPasado = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    });
    stickyCta.classList.toggle("visible", heroPasado && ctasEnPantalla.size === 0);
  });
  document.querySelectorAll("[data-main-cta]").forEach((cta) => observer.observe(cta));
  document.body.classList.add("has-sticky-cta");
}
