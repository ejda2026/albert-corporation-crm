import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";

const listaClientes = document.getElementById("lista-clientes");
const btnNuevoCliente = document.getElementById("btn-nuevo-cliente");
const buscadorClientes = document.getElementById("buscador-clientes");
const filtroCiudad = document.getElementById("filtro-ciudad");
const filtroTipo = document.getElementById("filtro-tipo");
const contadorClientes = document.getElementById("contador-clientes");
const modalForm = document.getElementById("modal-form-cliente");
const modalDetalle = document.getElementById("modal-detalle-cliente");
const formCliente = document.getElementById("form-cliente");
const tituloModalForm = document.getElementById("titulo-modal-form");
const btnGuardar = document.getElementById("btn-guardar-cliente");
const errorForm = document.getElementById("error-form-cliente");
const contenidoDetalle = document.getElementById("contenido-detalle-cliente");
const tituloDetalle = document.getElementById("titulo-modal-detalle");
const btnEditar = document.getElementById("btn-editar-cliente");
const btnEliminar = document.getElementById("btn-eliminar-cliente");

let unsubscribeClientes = null;
let clienteEnDetalleId = null;
let clientesEnMemoria = new Map();

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribirClientes();
  } else if (unsubscribeClientes) {
    unsubscribeClientes();
    unsubscribeClientes = null;
  }
});

function suscribirClientes() {
  if (unsubscribeClientes) return;
  const q = query(collection(db, "clientes"), orderBy("nombre"));
  unsubscribeClientes = onSnapshot(
    q,
    (snap) => {
      const clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      clientesEnMemoria = new Map(clientes.map((c) => [c.id, c]));
      repintarLista();
      if (clienteEnDetalleId && clientesEnMemoria.has(clienteEnDetalleId)) {
        pintarDetalle(clientesEnMemoria.get(clienteEnDetalleId));
      }
    },
    (error) => {
      console.error("Error al cargar clientes:", error);
      listaClientes.innerHTML =
        '<p class="mensaje-vacio">No se pudieron cargar los clientes. Recarga la página.</p>';
    }
  );
}

function repintarLista() {
  const todos = Array.from(clientesEnMemoria.values());
  const filtrados = aplicarFiltros(todos);
  actualizarContador(filtrados.length, todos.length);

  if (todos.length === 0) {
    listaClientes.innerHTML =
      '<p class="mensaje-vacio">Aún no hay clientes. Agrega el primero con el botón de arriba.</p>';
    return;
  }
  if (filtrados.length === 0) {
    listaClientes.innerHTML =
      '<p class="mensaje-vacio">No se encontraron clientes con esos filtros.</p>';
    return;
  }
  listaClientes.innerHTML = "";
  for (const cliente of filtrados) {
    listaClientes.appendChild(crearTarjetaCliente(cliente));
  }
}

function aplicarFiltros(clientes) {
  const texto = (buscadorClientes.value || "").trim().toLowerCase();
  const ciudad = filtroCiudad.value;
  const tipo = filtroTipo.value;
  return clientes.filter((c) => {
    if (ciudad && c.ciudad !== ciudad) return false;
    if (tipo && c.tipo !== tipo) return false;
    if (texto) {
      const blob = [
        c.nombre || "",
        c.telefono || "",
        c.notas || "",
        c.ciudad || ""
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    return true;
  });
}

function actualizarContador(mostrados, total) {
  if (total === 0) {
    contadorClientes.textContent = "";
    return;
  }
  if (mostrados === total) {
    contadorClientes.textContent = `(${total})`;
  } else {
    contadorClientes.textContent = `(${mostrados} de ${total})`;
  }
}

for (const el of [buscadorClientes, filtroCiudad, filtroTipo]) {
  el.addEventListener("input", repintarLista);
  el.addEventListener("change", repintarLista);
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

  tarjeta.addEventListener("click", () => abrirDetalle(cliente));
  return tarjeta;
}

btnNuevoCliente.addEventListener("click", () => abrirFormulario("nuevo"));

btnEditar.addEventListener("click", () => {
  if (!clienteEnDetalleId) return;
  cerrarModal(modalDetalle);
  abrirFormulario("editar", clienteEnDetalleId);
});

btnEliminar.addEventListener("click", async () => {
  if (!clienteEnDetalleId) return;
  const nombre = tituloDetalle.textContent || "este cliente";
  const ok = window.confirm(
    `¿Eliminar a "${nombre}"? Esta accion no se puede deshacer.`
  );
  if (!ok) return;
  try {
    btnEliminar.disabled = true;
    await deleteDoc(doc(db, "clientes", clienteEnDetalleId));
    cerrarModal(modalDetalle);
  } catch (error) {
    console.error("Error al eliminar cliente:", error);
    window.alert("No se pudo eliminar. Intenta de nuevo.");
  } finally {
    btnEliminar.disabled = false;
  }
});

for (const el of document.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => {
    cerrarModal(modalForm);
    cerrarModal(modalDetalle);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cerrarModal(modalForm);
    cerrarModal(modalDetalle);
  }
});

function abrirModal(modal) {
  modal.classList.remove("oculto");
}

function cerrarModal(modal) {
  modal.classList.add("oculto");
}

async function abrirFormulario(modo, id = null) {
  formCliente.dataset.modo = modo;
  formCliente.dataset.id = id || "";
  errorForm.textContent = "";

  if (modo === "nuevo") {
    tituloModalForm.textContent = "Nuevo cliente";
    btnGuardar.textContent = "Guardar cliente";
    formCliente.reset();
    document.querySelector(
      'input[name="tipo"][value="residencial"]'
    ).checked = true;
    abrirModal(modalForm);
    return;
  }

  tituloModalForm.textContent = "Editar cliente";
  btnGuardar.textContent = "Guardar cambios";
  const enMemoria = clientesEnMemoria.get(id);
  if (enMemoria) {
    prellenarFormulario(enMemoria);
    abrirModal(modalForm);
    return;
  }
  btnGuardar.disabled = true;
  abrirModal(modalForm);
  try {
    const snap = await getDoc(doc(db, "clientes", id));
    if (!snap.exists()) {
      errorForm.textContent = "El cliente ya no existe.";
      btnGuardar.disabled = false;
      return;
    }
    prellenarFormulario(snap.data());
    btnGuardar.disabled = false;
  } catch (error) {
    console.error("Error al cargar cliente para editar:", error);
    errorForm.textContent = "No se pudo cargar el cliente.";
    btnGuardar.disabled = false;
  }
}

function prellenarFormulario(cliente) {
  const tipoInput = document.querySelector(
    `input[name="tipo"][value="${cliente.tipo || "residencial"}"]`
  );
  if (tipoInput) tipoInput.checked = true;
  document.getElementById("nuevo-nombre").value = cliente.nombre || "";
  document.getElementById("nuevo-telefono").value = cliente.telefono || "";
  document.getElementById("nuevo-ciudad").value = cliente.ciudad || "Navojoa";
  document.getElementById("nuevo-notas").value = cliente.notas || "";
}

formCliente.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";

  const datos = leerFormulario();
  if (!datos.nombre || !datos.telefono) {
    errorForm.textContent = "Faltan datos obligatorios.";
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
    return;
  }

  const modo = formCliente.dataset.modo;
  const id = formCliente.dataset.id;

  try {
    if (modo === "editar" && id) {
      await updateDoc(doc(db, "clientes", id), {
        ...datos,
        fechaActualizacion: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "clientes"), {
        ...datos,
        activo: true,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp()
      });
    }
    cerrarModal(modalForm);
    formCliente.reset();
  } catch (error) {
    console.error("Error al guardar cliente:", error);
    errorForm.textContent = "No se pudo guardar. Intenta de nuevo.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

function leerFormulario() {
  const tipo =
    document.querySelector('input[name="tipo"]:checked')?.value ||
    "residencial";
  return {
    tipo,
    nombre: document.getElementById("nuevo-nombre").value.trim(),
    telefono: document.getElementById("nuevo-telefono").value.trim(),
    ciudad: document.getElementById("nuevo-ciudad").value,
    notas: document.getElementById("nuevo-notas").value.trim()
  };
}

function abrirDetalle(cliente) {
  clienteEnDetalleId = cliente.id;
  abrirModal(modalDetalle);
  pintarDetalle(cliente);
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
      ([etiqueta, _]) => `
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
