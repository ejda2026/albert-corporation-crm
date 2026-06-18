import {
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";

const listaClientes = document.getElementById("lista-clientes");
const btnNuevoCliente = document.getElementById("btn-nuevo-cliente");
const modalNuevo = document.getElementById("modal-nuevo-cliente");
const modalDetalle = document.getElementById("modal-detalle-cliente");
const formNuevo = document.getElementById("form-nuevo-cliente");
const btnGuardar = document.getElementById("btn-guardar-cliente");
const errorNuevo = document.getElementById("error-nuevo-cliente");
const contenidoDetalle = document.getElementById("contenido-detalle-cliente");
const tituloDetalle = document.getElementById("titulo-modal-detalle");

let unsubscribeClientes = null;

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribirClientes();
  } else {
    if (unsubscribeClientes) {
      unsubscribeClientes();
      unsubscribeClientes = null;
    }
  }
});

function suscribirClientes() {
  if (unsubscribeClientes) return;
  const q = query(collection(db, "clientes"), orderBy("nombre"));
  unsubscribeClientes = onSnapshot(
    q,
    (snap) => pintarLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error("Error al cargar clientes:", error);
      listaClientes.innerHTML =
        '<p class="mensaje-vacio">No se pudieron cargar los clientes. Recarga la página.</p>';
    }
  );
}

function pintarLista(clientes) {
  if (clientes.length === 0) {
    listaClientes.innerHTML =
      '<p class="mensaje-vacio">Aún no hay clientes. Agrega el primero con el botón de arriba.</p>';
    return;
  }
  listaClientes.innerHTML = "";
  for (const cliente of clientes) {
    listaClientes.appendChild(crearTarjetaCliente(cliente));
  }
}

function crearTarjetaCliente(cliente) {
  const tarjeta = document.createElement("button");
  tarjeta.type = "button";
  tarjeta.className = "tarjeta-cliente";
  tarjeta.dataset.id = cliente.id;

  const tipoTxt = cliente.tipo === "comercial" ? "Comercial" : "Residencial";
  tarjeta.innerHTML = `
    <div class="nombre-cliente"></div>
    <div class="meta-cliente">
      <span class="etiqueta-tipo ${cliente.tipo || "residencial"}">${tipoTxt}</span>
      <span class="ciudad"></span>
      <span class="telefono"></span>
    </div>
  `;
  tarjeta.querySelector(".nombre-cliente").textContent =
    cliente.nombre || "(sin nombre)";
  tarjeta.querySelector(".ciudad").textContent = cliente.ciudad || "";
  tarjeta.querySelector(".telefono").textContent = cliente.telefono || "";

  tarjeta.addEventListener("click", () => abrirDetalle(cliente.id));
  return tarjeta;
}

btnNuevoCliente.addEventListener("click", () => abrirModal(modalNuevo));

for (const el of document.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => {
    cerrarModal(modalNuevo);
    cerrarModal(modalDetalle);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cerrarModal(modalNuevo);
    cerrarModal(modalDetalle);
  }
});

function abrirModal(modal) {
  modal.classList.remove("oculto");
}

function cerrarModal(modal) {
  modal.classList.add("oculto");
}

formNuevo.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorNuevo.textContent = "";
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando...";

  const datos = leerFormulario();
  if (!datos.nombre || !datos.telefono) {
    errorNuevo.textContent = "Faltan datos obligatorios.";
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar cliente";
    return;
  }

  try {
    await addDoc(collection(db, "clientes"), {
      ...datos,
      activo: true,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
    formNuevo.reset();
    document.querySelector('input[name="tipo"][value="residencial"]').checked = true;
    cerrarModal(modalNuevo);
  } catch (error) {
    console.error("Error al guardar cliente:", error);
    errorNuevo.textContent = "No se pudo guardar. Intenta de nuevo.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar cliente";
  }
});

function leerFormulario() {
  const tipo =
    document.querySelector('input[name="tipo"]:checked')?.value || "residencial";
  return {
    tipo,
    nombre: document.getElementById("nuevo-nombre").value.trim(),
    telefono: document.getElementById("nuevo-telefono").value.trim(),
    ciudad: document.getElementById("nuevo-ciudad").value,
    notas: document.getElementById("nuevo-notas").value.trim()
  };
}

async function abrirDetalle(id) {
  contenidoDetalle.innerHTML =
    '<p class="mensaje-vacio">Cargando...</p>';
  tituloDetalle.textContent = "Detalle del cliente";
  abrirModal(modalDetalle);
  try {
    const snap = await getDoc(doc(db, "clientes", id));
    if (!snap.exists()) {
      contenidoDetalle.innerHTML =
        '<p class="mensaje-vacio">Cliente no encontrado.</p>';
      return;
    }
    pintarDetalle(snap.data());
  } catch (error) {
    console.error("Error al cargar detalle:", error);
    contenidoDetalle.innerHTML =
      '<p class="mensaje-vacio">No se pudo cargar el detalle.</p>';
  }
}

function pintarDetalle(cliente) {
  tituloDetalle.textContent = cliente.nombre || "Cliente";
  const filas = [
    ["Tipo", cliente.tipo === "comercial" ? "Comercial" : "Residencial"],
    ["Teléfono", cliente.telefono || "—"],
    ["Ciudad / zona", cliente.ciudad || "—"],
    ["Notas", cliente.notas || "—"],
    ["Estado", cliente.activo === false ? "Inactivo" : "Activo"]
  ];
  contenidoDetalle.innerHTML = filas
    .map(
      ([etiqueta, valor]) => `
        <div class="fila">
          <span class="etiqueta">${etiqueta}</span>
          <span class="valor"></span>
        </div>
      `
    )
    .join("");
  const valores = contenidoDetalle.querySelectorAll(".valor");
  filas.forEach(([, valor], i) => {
    valores[i].textContent = valor;
  });
}
