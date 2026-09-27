// Achica una imagen en el navegador y la devuelve como texto (data URL) para guardarla en Firestore.
// Así no necesitamos Firebase Storage, que pide plan de pago.
export async function comprimirImagen(archivo, { ancho, alto, formato = "image/jpeg", calidad = 0.78 }) {
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await cargarImagen(url);
    const escala = Math.min(1, ancho / imagen.width, alto / imagen.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagen.width * escala);
    canvas.height = Math.round(imagen.height * escala);

    const contexto = canvas.getContext("2d");
    if (formato === "image/jpeg") {
      // JPG no tiene transparencia: pintamos fondo blanco para que no quede negro
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
    }
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(formato, calidad);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cargarImagen(url) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = rechazar;
    imagen.src = url;
  });
}
