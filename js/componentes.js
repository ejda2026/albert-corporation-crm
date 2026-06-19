import {
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./config.js";

export const COMPONENTES = {
  "sal-pellets": { etiqueta: "Sal en pellets", frecuenciaDefault: 1 },
  carbon: { etiqueta: "Filtro de carbón", frecuenciaDefault: 6 },
  resina: { etiqueta: "Resina", frecuenciaDefault: 12 },
  turbidex: { etiqueta: "Turbidex", frecuenciaDefault: 6 },
  "lampara-uv": { etiqueta: "Lámpara UV", frecuenciaDefault: 12 },
  preventivo: { etiqueta: "Mantenimiento preventivo", frecuenciaDefault: 3 },
  "filtro-alberca": { etiqueta: "Filtro de alberca", frecuenciaDefault: 3 },
  "quimicos-alberca": { etiqueta: "Químicos de alberca", frecuenciaDefault: 1 },
  otro: { etiqueta: "Otro", frecuenciaDefault: 3 }
};

const modalComponente = document.getElementById("modal-form-componente");
const formComponente = document.getElementById("form-componente");
const tituloModal = document.getElementById("titulo-modal-componente");
const selectTipo = document.getElementById("comp-tipo");
const inputFrecuencia = document.getElementById("comp-frecuencia");
const inputUltimo = document.getElementById("comp-ultimo");
const inputNotas = document.getElementById("comp-notas");
const errorForm = document.getElementById("error-form-componente");
const btnGuardar = document.getElementById("btn-guardar-componente");

let equipoEnEdicion = null;
let indiceEnEdicion = null;
let callbackAlGuardar = null;

selectTipo.addEventListener("change", () => {
  const def = COMPONENTES[selectTipo.value];
  if (def && !inputFrecuencia.value) {
    inputFrecuencia.value = def.frecuenciaDefault;
  }
});

for (const el of modalComponente.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => cerrarModal());
}

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !modalComponente.classList.contains("oculto")
  ) {
    cerrarModal();
  }
});

formComponente.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  if (!equipoEnEdicion) return;
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";

  const datos = {
    tipo: selectTipo.value,
    frecuenciaMeses: parseInt(inputFrecuencia.value, 10) || 0,
    ultimoMantenimiento: inputUltimo.value || null,
    notas: inputNotas.value.trim(),
    activo: true
  };

  if (!datos.frecuenciaMeses) {
    errorForm.textContent = "La frecuencia debe ser un número mayor a 0.";
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
    return;
  }

  try {
    const componentesActuales = Array.isArray(equipoEnEdicion.componentes)
      ? [...equipoEnEdicion.componentes]
      : [];
    if (indiceEnEdicion !== null) {
      componentesActuales[indiceEnEdicion] = datos;
    } else {
      componentesActuales.push(datos);
    }
    await updateDoc(doc(db, "equipos", equipoEnEdicion.id), {
      componentes: componentesActuales,
      fechaActualizacion: serverTimestamp()
    });
    cerrarModal();
    if (callbackAlGuardar) callbackAlGuardar();
  } catch (error) {
    console.error("Error al guardar componente:", error);
    errorForm.textContent = "No se pudo guardar. Intenta de nuevo.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

export function abrirModalAgregarComponente(equipo, callback) {
  equipoEnEdicion = equipo;
  indiceEnEdicion = null;
  callbackAlGuardar = callback;
  tituloModal.textContent = "Agregar componente";
  btnGuardar.textContent = "Guardar";
  formComponente.reset();
  selectTipo.value = "sal-pellets";
  inputFrecuencia.value = COMPONENTES["sal-pellets"].frecuenciaDefault;
  errorForm.textContent = "";
  modalComponente.classList.remove("oculto");
}

export function abrirModalEditarComponente(equipo, indice, callback) {
  equipoEnEdicion = equipo;
  indiceEnEdicion = indice;
  callbackAlGuardar = callback;
  const comp = equipo.componentes[indice];
  tituloModal.textContent = "Editar componente";
  btnGuardar.textContent = "Guardar cambios";
  selectTipo.value = comp.tipo || "otro";
  inputFrecuencia.value = comp.frecuenciaMeses || "";
  inputUltimo.value = comp.ultimoMantenimiento || "";
  inputNotas.value = comp.notas || "";
  errorForm.textContent = "";
  modalComponente.classList.remove("oculto");
}

function cerrarModal() {
  modalComponente.classList.add("oculto");
}

export async function eliminarComponente(equipo, indice) {
  const componentes = (equipo.componentes || []).filter((_, i) => i !== indice);
  await updateDoc(doc(db, "equipos", equipo.id), {
    componentes,
    fechaActualizacion: serverTimestamp()
  });
}

export async function marcarMantenimientoRealizado(equipo, indice) {
  const componentes = (equipo.componentes || []).map((c, i) =>
    i === indice
      ? { ...c, ultimoMantenimiento: hoyISO() }
      : c
  );
  await updateDoc(doc(db, "equipos", equipo.id), {
    componentes,
    fechaActualizacion: serverTimestamp()
  });
}

export function calcularProximoMantenimiento(componente, equipo) {
  const base =
    componente.ultimoMantenimiento ||
    equipo.fechaInstalacion ||
    hoyISO();
  return sumarMeses(base, componente.frecuenciaMeses || 0);
}

export function estadoDeMantenimiento(fechaISO) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const diffMs = fecha - hoy;
  const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (dias < 0) return { tipo: "vencido", dias: Math.abs(dias) };
  if (dias <= 7) return { tipo: "proximo", dias };
  return { tipo: "al-dia", dias };
}

export function formatearFechaCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sumarMeses(isoBase, meses) {
  const [y, m, d] = isoBase.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setMonth(fecha.getMonth() + meses);
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
