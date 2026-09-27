import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#auth-form");
const nombreInput = $("#nombre");
const emailInput = $("#email");
const passwordInput = $("#password");
const password2Input = $("#password2");
const message = $("#auth-message");
const submitButton = $("#auth-submit");
const switchButton = $("#switch-mode");
const forgotButton = $("#forgot");

// "registro" o "entrar". Se puede abrir directo en modo entrar con cuenta.html?modo=entrar
let mode = new URLSearchParams(location.search).get("modo") === "entrar" ? "entrar" : "registro";
let registrando = false; // mientras se crea la cuenta, no redirigimos hasta guardar el nombre

const errores = {
  "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Prueba iniciar sesión.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  "auth/missing-email": "Escribe tu correo primero."
};

// Íconos del botón para mostrar/ocultar contraseña
const OJO_ABIERTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_CERRADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

document.querySelectorAll(".password-toggle").forEach((boton) => {
  const input = document.getElementById(boton.dataset.target);
  boton.innerHTML = OJO_ABIERTO;
  boton.addEventListener("click", () => {
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    boton.innerHTML = mostrar ? OJO_CERRADO : OJO_ABIERTO;
    boton.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
  });
});

function showMessage(text, ok = false) {
  message.textContent = text;
  message.classList.toggle("ok", ok);
}

function render() {
  const isRegistro = mode === "registro";
  $("#auth-eyebrow").textContent = isRegistro ? "CREA TU CUENTA" : "QUÉ BUENO VERTE DE NUEVO";
  $("#auth-title").textContent = isRegistro ? "Empieza tu página" : "Entra a tu panel";
  $("#switch-text").textContent = isRegistro ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?";
  switchButton.textContent = isRegistro ? "Inicia sesión" : "Crea una";
  submitButton.textContent = isRegistro ? "Crear cuenta" : "Entrar";
  passwordInput.autocomplete = isRegistro ? "new-password" : "current-password";

  // Nombre y confirmación solo se piden al crear cuenta
  $("#name-field").hidden = !isRegistro;
  $("#confirm-field").hidden = !isRegistro;
  $("#password-hint").hidden = !isRegistro;
  nombreInput.required = isRegistro;
  password2Input.required = isRegistro;

  forgotButton.hidden = isRegistro;
  showMessage("");
}

switchButton.addEventListener("click", () => {
  mode = mode === "registro" ? "entrar" : "registro";
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  if (mode === "registro") {
    if (!nombreInput.value.trim()) return showMessage("Escribe tu nombre.");
    if (passwordInput.value !== password2Input.value) return showMessage("Las contraseñas no coinciden.");
  }

  submitButton.disabled = true;
  try {
    if (mode === "registro") {
      registrando = true;
      const { user } = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
      try {
        await updateProfile(user, { displayName: nombreInput.value.trim() });
      } catch (error) {
        console.error(error); // la cuenta ya existe; si falla el nombre, igual seguimos
      }
      location.href = "panel.html";
    } else {
      await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
      // onAuthStateChanged (abajo) se encarga de ir al panel
    }
  } catch (error) {
    registrando = false;
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
  if (user && !registrando) location.href = "panel.html";
});

render();
