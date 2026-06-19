import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";

let configActual = null;
let unsubscribeConfig = null;
const listenersExternos = new Set();

const modal = document.getElementById("modal-ajustes");
const btnAbrir = document.getElementById("btn-ajustes");
const form = document.getElementById("form-ajustes");
const btnGuardar = document.getElementById("btn-guardar-ajustes");
const errorEl = document.getElementById("error-ajustes");

const campos = {
  nombreNegocio: document.getElementById("aj-nombre-negocio"),
  telefono: document.getElementById("aj-telefono"),
  email: document.getElementById("aj-email"),
  direccion: document.getElementById("aj-direccion"),
  razonSocial: document.getElementById("aj-razon-social"),
  rfc: document.getElementById("aj-rfc"),
  regimen: document.getElementById("aj-regimen"),
  codigoPostal: document.getElementById("aj-cp"),
  plantillaVencido: document.getElementById("aj-plantilla-vencido"),
  plantillaProximo: document.getElementById("aj-plantilla-proximo"),
  plantillaAldia: document.getElementById("aj-plantilla-aldia"),
  plantillaCobro: document.getElementById("aj-plantilla-cobro")
};

export function getConfiguracion() {
  return configActual || {};
}

export function onConfiguracionActualizada(listener) {
  listenersExternos.add(listener);
  return () => listenersExternos.delete(listener);
}

function notificarExternos() {
  for (const l of listenersExternos) {
    try {
      l(configActual);
    } catch (err) {
      console.error("Error en listener de configuracion:", err);
    }
  }
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribir();
  } else if (unsubscribeConfig) {
    unsubscribeConfig();
    unsubscribeConfig = null;
  }
});

function suscribir() {
  if (unsubscribeConfig) return;
  unsubscribeConfig = onSnapshot(
    doc(db, "configuracion", "general"),
    (snap) => {
      configActual = snap.exists() ? snap.data() : {};
      notificarExternos();
    },
    (error) => {
      console.error("Error al cargar configuracion:", error);
    }
  );
}

btnAbrir.addEventListener("click", () => {
  cargarFormulario();
  modal.classList.remove("oculto");
});

for (const el of modal.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => modal.classList.add("oculto"));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("oculto")) {
    modal.classList.add("oculto");
  }
});

function cargarFormulario() {
  const c = configActual || {};
  campos.nombreNegocio.value = c.nombreNegocio || "Albert Corporation";
  campos.telefono.value = c.telefono || "";
  campos.email.value = c.email || "";
  campos.direccion.value = c.direccion || "";
  campos.razonSocial.value = c.razonSocial || "";
  campos.rfc.value = c.rfc || "";
  campos.regimen.value = c.regimen || "";
  campos.codigoPostal.value = c.codigoPostal || "";
  campos.plantillaVencido.value = c.plantillaVencido || "";
  campos.plantillaProximo.value = c.plantillaProximo || "";
  campos.plantillaAldia.value = c.plantillaAldia || "";
  campos.plantillaCobro.value = c.plantillaCobro || "";
  errorEl.textContent = "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";
  const datos = {
    nombreNegocio: campos.nombreNegocio.value.trim(),
    telefono: campos.telefono.value.trim(),
    email: campos.email.value.trim(),
    direccion: campos.direccion.value.trim(),
    razonSocial: campos.razonSocial.value.trim(),
    rfc: campos.rfc.value.trim().toUpperCase(),
    regimen: campos.regimen.value.trim(),
    codigoPostal: campos.codigoPostal.value.trim(),
    plantillaVencido: campos.plantillaVencido.value.trim(),
    plantillaProximo: campos.plantillaProximo.value.trim(),
    plantillaAldia: campos.plantillaAldia.value.trim(),
    plantillaCobro: campos.plantillaCobro.value.trim(),
    fechaActualizacion: serverTimestamp()
  };
  try {
    await setDoc(doc(db, "configuracion", "general"), datos, { merge: true });
    modal.classList.add("oculto");
  } catch (error) {
    console.error("Error al guardar configuracion:", error);
    errorEl.textContent =
      "No se pudo guardar. Solo el rol admin puede editar ajustes.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});
