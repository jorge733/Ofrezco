// Conexión a Firebase. Todos los demás archivos importan "auth" y "db" desde aquí.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Configuración del proyecto (Firebase → Configuración del proyecto → Tus apps → Web)
const firebaseConfig = {
  apiKey: "AIzaSyAOvR56ulZrHsd9FBJmCmSUYCNBJIAuRKI",
  authDomain: "ofrezco-2583a.firebaseapp.com",
  projectId: "ofrezco-2583a",
  storageBucket: "ofrezco-2583a.firebasestorage.app",
  messagingSenderId: "1099071794710",
  appId: "1:1099071794710:web:d5d50573167825c0c60f37"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
