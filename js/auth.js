import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { auth, db } from "./config.js";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const pantallaLogin = document.getElementById("pantalla-login");
const pantallaApp = document.getElementById("pantalla-app");
const usuarioNombre = document.getElementById("usuario-nombre");

loginForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Entrando...";
  try {
    await signInWithEmailAndPassword(
      auth,
      loginEmail.value.trim(),
      loginPassword.value
    );
  } catch (error) {
    loginError.textContent = traducirError(error.code);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Entrar";
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    pantallaLogin.classList.remove("oculto");
    pantallaApp.classList.add("oculto");
    return;
  }
  pantallaLogin.classList.add("oculto");
  pantallaApp.classList.remove("oculto");
  const datos = await obtenerDatosUsuario(usuario.uid);
  usuarioNombre.textContent = datos?.nombre || usuario.email;
});

async function obtenerDatosUsuario(uid) {
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

function traducirError(codigo) {
  const mensajes = {
    "auth/invalid-email": "Correo no válido.",
    "auth/user-not-found": "Usuario no encontrado.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión a internet."
  };
  return mensajes[codigo] || "No se pudo iniciar sesión. Intenta de nuevo.";
}
