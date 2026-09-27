import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const form = document.querySelector("#auth-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#auth-message");
const submitButton = document.querySelector("#auth-submit");
const switchButton = document.querySelector("#switch-mode");
const forgotButton = document.querySelector("#forgot");

// "registro" o "entrar". Se puede abrir directo en modo entrar con cuenta.html?modo=entrar
let mode = new URLSearchParams(location.search).get("modo") === "entrar" ? "entrar" : "registro";

const errores = {
  "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Prueba iniciar sesión.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  "auth/missing-email": "Escribe tu correo primero."
};

function showMessage(text, ok = false) {
  message.textContent = text;
  message.classList.toggle("ok", ok);
}

function render() {
  const isRegistro = mode === "registro";
  document.querySelector("#auth-eyebrow").textContent = isRegistro ? "CREA TU CUENTA" : "BIENVENIDO DE VUELTA";
  document.querySelector("#auth-title").textContent = isRegistro ? "Empieza tu página" : "Entra a tu panel";
  document.querySelector("#switch-text").textContent = isRegistro ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?";
  switchButton.textContent = isRegistro ? "Inicia sesión" : "Crea una";
  submitButton.textContent = isRegistro ? "Crear cuenta" : "Entrar";
  passwordInput.autocomplete = isRegistro ? "new-password" : "current-password";
  forgotButton.hidden = isRegistro;
  showMessage("");
}

switchButton.addEventListener("click", () => {
  mode = mode === "registro" ? "entrar" : "registro";
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("");

  try {
    if (mode === "registro") {
      await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    } else {
      await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    }
    // No hace falta redirigir aquí: onAuthStateChanged (abajo) lo hace.
  } catch (error) {
    showMessage(errores[error.code] || "Algo salió mal. Inténtalo de nuevo.");
    submitButton.disabled = false;
  }
});

forgotButton.addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, emailInput.value);
    showMessage("Te enviamos un correo para cambiar tu contraseña.", true);
  } catch (error) {
    showMessage(errores[error.code] || "No pudimos enviar el correo.");
  }
});

// Si ya hay sesión iniciada, ir directo al panel.
onAuthStateChanged(auth, (user) => {
  if (user) location.href = "panel.html";
});

render();
