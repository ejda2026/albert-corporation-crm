import {
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { auth, db } from "./config.js";

const modal = document.getElementById("modal-nueva-nota");
const form = document.getElementById("form-nota");
const infoCliente = document.getElementById("nota-cliente-info");
const textoNota = document.getElementById("nota-texto");
const errorEl = document.getElementById("error-form-nota");
const btnGuardar = document.getElementById("btn-guardar-nota");

let clienteEnEdicion = null;

export function abrirModalNuevaNota(cliente) {
  clienteEnEdicion = cliente;
  infoCliente.textContent = `Cliente: ${cliente.nombre || "(sin nombre)"}`;
  textoNota.value = "";
  errorEl.textContent = "";
  modal.classList.remove("oculto");
  setTimeout(() => textoNota.focus(), 60);
}

for (const el of modal.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => modal.classList.add("oculto"));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("oculto")) {
    modal.classList.add("oculto");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  if (!clienteEnEdicion) return;
  const texto = textoNota.value.trim();
  if (!texto) {
    errorEl.textContent = "La nota no puede estar vacía.";
    return;
  }
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";
  try {
    const usuario = auth.currentUser;
    const nombreEnHeader =
      document.getElementById("usuario-nombre")?.textContent?.trim() || "";
    const nota = {
      texto,
      fechaIso: new Date().toISOString(),
      autorEmail: usuario?.email || "",
      autorNombre: nombreEnHeader || usuario?.email || ""
    };
    await updateDoc(doc(db, "clientes", clienteEnEdicion.id), {
      notas: arrayUnion(nota),
      fechaActualizacion: serverTimestamp()
    });
    modal.classList.add("oculto");
  } catch (error) {
    console.error("Error al guardar nota:", error);
    errorEl.textContent = "No se pudo guardar la nota.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

export function pintarHistorialNotas(contenedor, cliente) {
  const notas = Array.isArray(cliente.notas) ? cliente.notas : [];
  const ordenadas = [...notas].sort((a, b) =>
    (b.fechaIso || "").localeCompare(a.fechaIso || "")
  );
  if (ordenadas.length === 0) {
    contenedor.innerHTML =
      '<p class="mensaje-vacio-pequeño">Aún no hay notas. Agrega la primera con el botón de arriba.</p>';
    return;
  }
  contenedor.innerHTML = "";
  for (const n of ordenadas) {
    contenedor.appendChild(crearNota(n));
  }
}

function crearNota(n) {
  const item = document.createElement("div");
  item.className = "nota-item";
  item.innerHTML = `
    <div class="nota-cabecera">
      <span class="nota-fecha"></span>
      <span class="nota-autor"></span>
    </div>
    <div class="nota-texto"></div>
  `;
  item.querySelector(".nota-fecha").textContent = formatearFechaHora(n.fechaIso);
  item.querySelector(".nota-autor").textContent =
    n.autorNombre || n.autorEmail || "—";
  item.querySelector(".nota-texto").textContent = n.texto || "";
  return item;
}

function formatearFechaHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${anio} ${hora}:${min}`;
}
