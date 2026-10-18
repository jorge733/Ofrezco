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

  tabs.forEach((tab) => {
    const activa = tab.dataset.example === key;
    tab.classList.toggle("active", activa);
    tab.setAttribute("aria-pressed", String(activa));
  });
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

// ==== Bloques de confianza ====
// Cada bloque queda oculto hasta que su flag sea true. Para revisarlos antes de publicarlos,
// abre la portada con ?vista-previa al final (por ejemplo localhost:5500/?vista-previa).
const MOSTRAR_PAGINAS_REALES = false;
const MOSTRAR_TESTIMONIO = false;
const MOSTRAR_QUIENES_SOMOS = false; // TODO: completa tu foto, nombre y texto en index.html

// TODO: estos negocios son DATOS DE EJEMPLO, no existen. Reemplázalos por páginas reales
// (con permiso de sus dueños) antes de cambiar MOSTRAR_PAGINAS_REALES a true.
// "enlace" es lo que va después de serviceplanet.cl/
const paginasReales = [
  { nombre: "Pastelería de ejemplo", rubro: "Repostería", comuna: "Maipú", enlace: "ejemplo-pasteleria" },
  { nombre: "Gasfitería de ejemplo", rubro: "Gasfitería", comuna: "Puente Alto", enlace: "ejemplo-gasfiteria" },
  { nombre: "Clases de ejemplo", rubro: "Clases particulares", comuna: "Ñuñoa", enlace: "ejemplo-clases" }
];

// TODO: este testimonio es un EJEMPLO, no es real. Reemplázalo por uno real (con permiso)
// antes de cambiar MOSTRAR_TESTIMONIO a true. "foto" puede quedar vacía: se muestra la inicial.
const testimonio = {
  foto: "", // por ejemplo "testimonio-ana.jpg"
  nombre: "Nombre de ejemplo",
  comuna: "Comuna de ejemplo",
  frase: "Aquí va lo que te contó un emprendedor real sobre su página."
};

const vistaPrevia = new URLSearchParams(location.search).has("vista-previa");

function mostrarBloque(id, activo) {
  const bloque = document.getElementById(id);
  if (!bloque || !(activo || vistaPrevia)) return null;
  bloque.hidden = false;
  bloque.classList.toggle("preview-mode", !activo);
  return bloque;
}

// Círculo con la inicial, igual que el de la tarjeta de ejemplo de la portada
function avatarInicial(nombre) {
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = nombre.charAt(0);
  return avatar;
}

if (mostrarBloque("paginas-reales", MOSTRAR_PAGINAS_REALES)) {
  const grid = document.querySelector("#showcase-grid");
  paginasReales.forEach((pagina) => {
    const card = document.createElement("a");
    card.className = "showcase-card";
    card.href = `/${pagina.enlace}`;
    card.innerHTML = `
      <span class="showcase-head"><span><strong></strong><small></small></span></span>
      <span class="showcase-link"><span></span> <span aria-hidden="true">→</span></span>`;
    card.querySelector(".showcase-head").prepend(avatarInicial(pagina.nombre));
    card.querySelector("strong").textContent = pagina.nombre;
    card.querySelector("small").textContent = `${pagina.rubro} · ${pagina.comuna}`;
    card.querySelector(".showcase-link span").textContent = `serviceplanet.cl/${pagina.enlace}`;
    grid.append(card);
  });
}

if (mostrarBloque("testimonio", MOSTRAR_TESTIMONIO)) {
  const tarjeta = document.querySelector("#testimonio-tarjeta");
  tarjeta.innerHTML = `<blockquote></blockquote><figcaption><span><strong></strong><small></small></span></figcaption>`;
  tarjeta.querySelector("blockquote").textContent = testimonio.frase;
  tarjeta.querySelector("strong").textContent = testimonio.nombre;
  tarjeta.querySelector("small").textContent = testimonio.comuna;
  let foto = avatarInicial(testimonio.nombre);
  if (testimonio.foto) {
    foto = Object.assign(document.createElement("img"), { src: testimonio.foto, alt: `Foto de ${testimonio.nombre}`, width: 47, height: 47, loading: "lazy", decoding: "async" });
  }
  tarjeta.querySelector("figcaption").prepend(foto);
}

mostrarBloque("quienes-somos", MOSTRAR_QUIENES_SOMOS);

// ==== Video o GIF corto del editor en "Cómo funciona" ====
// TODO: cuando tengas el video, súbelo junto a index.html y escribe aquí su nombre
// (por ejemplo "editor.mp4" o "editor.gif") y una imagen de portada para "poster".
// Mientras "src" esté vacío, el espacio no se muestra.
const VIDEO_EDITOR = {
  src: "",
  poster: "",
  descripcion: "Video corto: así se arma una página en el editor de ServicePlanet"
};

const videoEditor = document.querySelector("#video-editor");
if (VIDEO_EDITOR.src && videoEditor) {
  videoEditor.hidden = false;
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Se carga solo cuando está por aparecer en pantalla, para no hacer más lenta la portada
  const cargarVideo = () => {
    let media;
    if (VIDEO_EDITOR.src.endsWith(".gif")) {
      // Con "reducir movimiento" se muestra la portada fija en vez del GIF animado
      media = Object.assign(document.createElement("img"), {
        src: sinMovimiento && VIDEO_EDITOR.poster ? VIDEO_EDITOR.poster : VIDEO_EDITOR.src,
        alt: VIDEO_EDITOR.descripcion,
        decoding: "async"
      });
    } else {
      media = Object.assign(document.createElement("video"), {
        src: VIDEO_EDITOR.src,
        poster: VIDEO_EDITOR.poster,
        muted: true,
        loop: true,
        playsInline: true,
        autoplay: !sinMovimiento,
        controls: sinMovimiento,
        preload: sinMovimiento ? "none" : "auto"
      });
      media.setAttribute("aria-label", VIDEO_EDITOR.descripcion);
      media.setAttribute("muted", ""); // iPhone reproduce automáticamente solo si el atributo está en el HTML
      media.setAttribute("playsinline", "");
    }
    videoEditor.append(media);
  };

  if ("IntersectionObserver" in window) {
    const observador = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observador.disconnect();
      cargarVideo();
    }, { rootMargin: "300px" });
    observador.observe(videoEditor);
  } else {
    cargarVideo();
  }
}
