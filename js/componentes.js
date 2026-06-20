import {
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./config.js";

export const COMPONENTES = {
  "sal-pellets": { etiqueta: "Sal en pellets" },
  carbon: { etiqueta: "Filtro de carbón" },
  resina: { etiqueta: "Resina" },
  turbidex: { etiqueta: "Turbidex" },
  "lampara-uv": { etiqueta: "Lámpara UV" },
  preventivo: { etiqueta: "Mantenimiento preventivo" },
  "aspirado-alberca": { etiqueta: "Aspirado de alberca" },
  "nivelacion-quimicos": { etiqueta: "Nivelación de químicos" },
  "lavado-filtro-arena": { etiqueta: "Lavado del filtro de arena" },
  "servicio-filtro-arena": { etiqueta: "Servicio al filtro de arena" },
  "mantenimiento-equipo-alberca": { etiqueta: "Mantenimiento de equipo (alberca)" },
  "quimicos-alberca": { etiqueta: "Recarga de químicos (cloro, pH)" },
  "filtro-alberca": { etiqueta: "Filtro de alberca" },
  otro: { etiqueta: "Otro" }
};

const modalComponente = document.getElementById("modal-form-componente");
const formComponente = document.getElementById("form-componente");
const tituloModal = document.getElementById("titulo-modal-componente");
const selectTipo = document.getElementById("comp-tipo");
const inputFrecuencia = document.getElementById("comp-frecuencia");
const selectUnidad = document.getElementById("comp-unidad");
const inputUltimo = document.getElementById("comp-ultimo");
const inputNotas = document.getElementById("comp-notas");
const errorForm = document.getElementById("error-form-componente");
const btnGuardar = document.getElementById("btn-guardar-componente");

let equipoEnEdicion = null;
let indiceEnEdicion = null;
let callbackAlGuardar = null;

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

  const valorFrec = parseInt(inputFrecuencia.value, 10) || 0;
  const unidad = selectUnidad.value;
  const dias = aDias(valorFrec, unidad);

  if (!dias) {
    errorForm.textContent = "La frecuencia debe ser un número mayor a 0.";
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
    return;
  }

  const datos = {
    tipo: selectTipo.value,
    frecuenciaDias: dias,
    frecuenciaValor: valorFrec,
    frecuenciaUnidad: unidad,
    ultimoMantenimiento: inputUltimo.value || null,
    notas: inputNotas.value.trim(),
    activo: true
  };

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
  inputFrecuencia.value = "";
  selectUnidad.value = "meses";
  inputUltimo.value = "";
  inputNotas.value = "";
  errorForm.textContent = "";
  modalComponente.classList.remove("oculto");
  setTimeout(() => inputFrecuencia.focus(), 60);
}

export function abrirModalEditarComponente(equipo, indice, callback) {
  equipoEnEdicion = equipo;
  indiceEnEdicion = indice;
  callbackAlGuardar = callback;
  const comp = equipo.componentes[indice];
  tituloModal.textContent = "Editar componente";
  btnGuardar.textContent = "Guardar cambios";
  selectTipo.value = comp.tipo || "otro";
  const { valor, unidad } = obtenerValorYUnidad(comp);
  inputFrecuencia.value = valor || "";
  selectUnidad.value = unidad;
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
  const dias = obtenerFrecuenciaDias(componente);
  const base =
    componente.ultimoMantenimiento ||
    equipo.fechaInstalacion ||
    hoyISO();
  return sumarDias(base, dias);
}

export function obtenerFrecuenciaDias(componente) {
  if (componente.frecuenciaDias) return componente.frecuenciaDias;
  if (componente.frecuenciaMeses) return componente.frecuenciaMeses * 30;
  return 30;
}

export function describirFrecuencia(componente) {
  const dias = obtenerFrecuenciaDias(componente);
  if (componente.frecuenciaValor && componente.frecuenciaUnidad) {
    return describirUnidad(componente.frecuenciaValor, componente.frecuenciaUnidad);
  }
  if (dias % 30 === 0) {
    const m = dias / 30;
    return `Cada ${m} mes${m === 1 ? "" : "es"}`;
  }
  if (dias % 7 === 0) {
    const s = dias / 7;
    return `Cada ${s} semana${s === 1 ? "" : "s"}`;
  }
  return `Cada ${dias} día${dias === 1 ? "" : "s"}`;
}

function describirUnidad(valor, unidad) {
  const u = {
    dias: ["día", "días"],
    semanas: ["semana", "semanas"],
    meses: ["mes", "meses"],
    anos: ["año", "años"]
  }[unidad] || ["día", "días"];
  return `Cada ${valor} ${valor === 1 ? u[0] : u[1]}`;
}

function obtenerValorYUnidad(comp) {
  if (comp.frecuenciaValor && comp.frecuenciaUnidad) {
    return { valor: comp.frecuenciaValor, unidad: comp.frecuenciaUnidad };
  }
  if (comp.frecuenciaMeses) {
    return { valor: comp.frecuenciaMeses, unidad: "meses" };
  }
  if (comp.frecuenciaDias) {
    const d = comp.frecuenciaDias;
    if (d % 30 === 0) return { valor: d / 30, unidad: "meses" };
    if (d % 7 === 0) return { valor: d / 7, unidad: "semanas" };
    return { valor: d, unidad: "dias" };
  }
  return { valor: "", unidad: "meses" };
}

function aDias(valor, unidad) {
  if (!valor || valor < 1) return 0;
  switch (unidad) {
    case "semanas": return valor * 7;
    case "meses": return valor * 30;
    case "anos": return valor * 365;
    default: return valor;
  }
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

function sumarDias(isoBase, dias) {
  const [y, m, d] = isoBase.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
