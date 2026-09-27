// Ejemplos que muestra la tarjeta de la portada. Para agregar otro, copia uno y agrega su pestaña en index.html.
const examples = {
  pasteleria: {
    name: "María Pastelería",
    zone: "Pedidos en Santiago",
    intro: "Tortas y dulces hechos por encargo para celebrar lo que quieras.",
    items: [
      { emoji: "🍰", name: "Torta tres leches", price: "Desde $24.000" },
      { emoji: "🧁", name: "Caja de brownies", price: "$8.000" }
    ]
  },
  bicicletas: {
    name: "Rueda Libre",
    zone: "Arriendo en Puerto Varas",
    intro: "Bicicletas y cascos para recorrer el lago a tu ritmo.",
    items: [
      { emoji: "🚲", name: "Bicicleta urbana", price: "$5.000 la hora" },
      { emoji: "🚵", name: "Mountain bike por el día", price: "$18.000" }
    ]
  },
  clases: {
    name: "Guitarra con Camila",
    zone: "Online o en Ñuñoa",
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

function setWhatsapp(message, label) {
  whatsappLink.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  whatsappText.textContent = label;
}

function showExample(key) {
  const example = examples[key];
  document.querySelector("#example-avatar").textContent = example.name.charAt(0);
  document.querySelector("#example-name").textContent = example.name;
  document.querySelector("#example-zone").textContent = example.zone;
  document.querySelector("#example-intro").textContent = example.intro;
  setWhatsapp(`Hola ${example.name}, quiero hacer una consulta.`, "Consultar por WhatsApp");

  itemsList.innerHTML = "";
  example.items.forEach((item, i) => {
    const button = document.createElement("button");
    button.className = "product";
    button.type = "button";
    button.innerHTML = `
      <span class="product-image" aria-hidden="true"></span>
      <span class="product-info"><strong></strong><small></small></span>
      <span aria-hidden="true">+</span>`;
    button.querySelector(".product-image").textContent = item.emoji;
    button.querySelector(".product-image").style.background = colors[i % colors.length];
    button.querySelector("strong").textContent = item.name;
    button.querySelector("small").textContent = item.price;
    button.addEventListener("click", () => {
      setWhatsapp(`Hola ${example.name}, quiero consultar por ${item.name} (${item.price}).`, `Consultar por ${item.name}`);
    });
    itemsList.append(button);
  });

  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.example === key));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showExample(tab.dataset.example));
});

showExample("pasteleria");
