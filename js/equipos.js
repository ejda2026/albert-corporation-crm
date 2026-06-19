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
import {
  COMPONENTES,
  abrirModalAgregarComponente,
  abrirModalEditarComponente,
  eliminarComponente,
  marcarMantenimientoRealizado,
  calcularProximoMantenimiento,
  estadoDeMantenimiento,
  formatearFechaCorta
} from "./componentes.js";

const ETIQUETAS_TIPO = {
  "planta-purificadora": "Planta purificadora",
  "equipo-domestico": "Equipo doméstico",
  "alberca-equipo": "Equipo de alberca"
};

const listaEquipos = document.getElementById("lista-equipos");
const btnNuevoEquipo = document.getElementById("btn-nuevo-equipo");
const modalForm = document.getElementById("modal-form-equipo");
const modalDetalle = document.getElementById("modal-detalle-equipo");
const formEquipo = document.getElementById("form-equipo");
const tituloModalForm = document.getElementById("titulo-modal-form-equipo");
const btnGuardar = document.getElementById("btn-guardar-equipo");
const errorForm = document.getElementById("error-form-equipo");
const contenidoDetalle = document.getElementById("contenido-detalle-equipo");
const tituloDetalle = document.getElementById("titulo-modal-detalle-equipo");
const btnEditar = document.getElementById("btn-editar-equipo");
const btnEliminar = document.getElementById("btn-eliminar-equipo");
const selectCliente = document.getElementById("equipo-cliente");
const buscadorEquipos = document.getElementById("buscador-equipos");
const filtroTipo = document.getElementById("filtro-equipo-tipo");
const contadorEquipos = document.getElementById("contador-equipos");

let unsubscribeEquipos = null;
let unsubscribeClientesParaEquipos = null;
let equiposEnMemoria = new Map();
let clientesParaEquipos = new Map();
let equipoEnDetalleId = null;
const listeners = new Set();

export function getEquiposDeCliente(clienteId) {
  return Array.from(equiposEnMemoria.values()).filter(
    (e) => e.clienteId === clienteId
  );
}

export function getEtiquetaTipo(tipo) {
  return ETIQUETAS_TIPO[tipo] || "Otro";
}

export function onEquiposActualizados(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notificarListeners() {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      console.error("Error en listener de equipos:", err);
    }
  }
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribirEquipos();
    suscribirClientesParaSelect();
  } else {
    if (unsubscribeEquipos) {
      unsubscribeEquipos();
      unsubscribeEquipos = null;
    }
    if (unsubscribeClientesParaEquipos) {
      unsubscribeClientesParaEquipos();
      unsubscribeClientesParaEquipos = null;
    }
  }
});

function suscribirEquipos() {
  if (unsubscribeEquipos) return;
  const q = query(collection(db, "equipos"), orderBy("fechaCreacion", "desc"));
  unsubscribeEquipos = onSnapshot(
    q,
    (snap) => {
      const equipos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      equiposEnMemoria = new Map(equipos.map((e) => [e.id, e]));
      repintarLista();
      notificarListeners();
      if (equipoEnDetalleId && equiposEnMemoria.has(equipoEnDetalleId)) {
        pintarDetalle(equiposEnMemoria.get(equipoEnDetalleId));
      }
    },
    (error) => {
      console.error("Error al cargar equipos:", error);
      listaEquipos.innerHTML =
        '<p class="mensaje-vacio">No se pudieron cargar los equipos. Recarga la página.</p>';
    }
  );
}

function suscribirClientesParaSelect() {
  if (unsubscribeClientesParaEquipos) return;
  const q = query(collection(db, "clientes"), orderBy("nombre"));
  unsubscribeClientesParaEquipos = onSnapshot(q, (snap) => {
    const clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    clientesParaEquipos = new Map(clientes.map((c) => [c.id, c]));
    actualizarSelectClientes(clientes);
    repintarLista();
    notificarListeners();
  });
}

function actualizarSelectClientes(clientes) {
  const valorActual = selectCliente.value;
  selectCliente.innerHTML =
    '<option value="">Selecciona un cliente...</option>' +
    clientes
      .map(
        (c) =>
          `<option value="${c.id}"></option>`
      )
      .join("");
  const opciones = selectCliente.querySelectorAll("option[value]:not([value=''])");
  clientes.forEach((c, i) => {
    if (opciones[i]) opciones[i].textContent = c.nombre || "(sin nombre)";
  });
  if (valorActual) selectCliente.value = valorActual;
}

function repintarLista() {
  const todos = Array.from(equiposEnMemoria.values());
  const filtrados = aplicarFiltros(todos);
  actualizarContador(filtrados.length, todos.length);

  if (todos.length === 0) {
    listaEquipos.innerHTML =
      '<p class="mensaje-vacio">Aún no hay equipos. Agrega el primero con el botón de arriba.</p>';
    return;
  }
  if (filtrados.length === 0) {
    listaEquipos.innerHTML =
      '<p class="mensaje-vacio">No se encontraron equipos con esos filtros.</p>';
    return;
  }
  listaEquipos.innerHTML = "";
  for (const equipo of filtrados) {
    listaEquipos.appendChild(crearTarjetaEquipo(equipo));
  }
}

function crearTarjetaEquipo(equipo) {
  const cliente = clientesParaEquipos.get(equipo.clienteId);
  const tarjeta = document.createElement("button");
  tarjeta.type = "button";
  tarjeta.className = "tarjeta-cliente";
  tarjeta.dataset.id = equipo.id;
  tarjeta.innerHTML = `
    <div class="nombre-cliente"></div>
    <div class="meta-cliente">
      <span class="etiqueta-tipo comercial"></span>
      <span class="modelo"></span>
      <span class="fecha"></span>
    </div>
  `;
  tarjeta.querySelector(".nombre-cliente").textContent =
    cliente?.nombre || "(cliente eliminado)";
  tarjeta.querySelector(".etiqueta-tipo").textContent = getEtiquetaTipo(
    equipo.tipo
  );
  tarjeta.querySelector(".modelo").textContent = equipo.modelo || "";
  tarjeta.querySelector(".fecha").textContent = equipo.fechaInstalacion
    ? `Instalado: ${formatearFecha(equipo.fechaInstalacion)}`
    : "";

  tarjeta.addEventListener("click", () => abrirDetalle(equipo));
  return tarjeta;
}

function aplicarFiltros(equipos) {
  const texto = (buscadorEquipos.value || "").trim().toLowerCase();
  const tipo = filtroTipo.value;
  return equipos.filter((e) => {
    if (tipo && e.tipo !== tipo) return false;
    if (texto) {
      const cliente = clientesParaEquipos.get(e.clienteId);
      const blob = [
        cliente?.nombre || "",
        e.modelo || "",
        e.notas || "",
        getEtiquetaTipo(e.tipo)
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
    contadorEquipos.textContent = "";
    return;
  }
  contadorEquipos.textContent =
    mostrados === total ? `(${total})` : `(${mostrados} de ${total})`;
}

for (const el of [buscadorEquipos, filtroTipo]) {
  el.addEventListener("input", repintarLista);
  el.addEventListener("change", repintarLista);
}

btnNuevoEquipo.addEventListener("click", () => abrirFormulario("nuevo"));

btnEditar.addEventListener("click", () => {
  if (!equipoEnDetalleId) return;
  cerrarModal(modalDetalle);
  abrirFormulario("editar", equipoEnDetalleId);
});

btnEliminar.addEventListener("click", async () => {
  if (!equipoEnDetalleId) return;
  const ok = window.confirm(
    "Eliminar este equipo? Esta accion no se puede deshacer."
  );
  if (!ok) return;
  try {
    btnEliminar.disabled = true;
    await deleteDoc(doc(db, "equipos", equipoEnDetalleId));
    cerrarModal(modalDetalle);
  } catch (error) {
    console.error("Error al eliminar equipo:", error);
    window.alert("No se pudo eliminar. Intenta de nuevo.");
  } finally {
    btnEliminar.disabled = false;
  }
});

for (const el of modalForm.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => cerrarModal(modalForm));
}
for (const el of modalDetalle.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => cerrarModal(modalDetalle));
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

async function abrirFormulario(modo, id = null, clienteIdPredeterminado = null) {
  formEquipo.dataset.modo = modo;
  formEquipo.dataset.id = id || "";
  errorForm.textContent = "";

  if (modo === "nuevo") {
    tituloModalForm.textContent = "Nuevo equipo";
    btnGuardar.textContent = "Guardar equipo";
    formEquipo.reset();
    if (clienteIdPredeterminado) {
      selectCliente.value = clienteIdPredeterminado;
    }
    abrirModal(modalForm);
    return;
  }

  tituloModalForm.textContent = "Editar equipo";
  btnGuardar.textContent = "Guardar cambios";
  const enMemoria = equiposEnMemoria.get(id);
  if (enMemoria) {
    prellenarFormulario(enMemoria);
    abrirModal(modalForm);
    return;
  }
  abrirModal(modalForm);
  try {
    const snap = await getDoc(doc(db, "equipos", id));
    if (!snap.exists()) {
      errorForm.textContent = "El equipo ya no existe.";
      return;
    }
    prellenarFormulario(snap.data());
  } catch (error) {
    console.error("Error al cargar equipo:", error);
    errorForm.textContent = "No se pudo cargar el equipo.";
  }
}

function prellenarFormulario(equipo) {
  selectCliente.value = equipo.clienteId || "";
  document.getElementById("equipo-tipo").value =
    equipo.tipo || "planta-purificadora";
  document.getElementById("equipo-modelo").value = equipo.modelo || "";
  document.getElementById("equipo-fecha").value = equipo.fechaInstalacion || "";
  document.getElementById("equipo-notas").value = equipo.notas || "";
}

formEquipo.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";

  const datos = leerFormulario();
  if (!datos.clienteId || !datos.tipo) {
    errorForm.textContent = "Faltan datos obligatorios.";
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
    return;
  }

  const modo = formEquipo.dataset.modo;
  const id = formEquipo.dataset.id;

  try {
    if (modo === "editar" && id) {
      await updateDoc(doc(db, "equipos", id), {
        ...datos,
        fechaActualizacion: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "equipos"), {
        ...datos,
        activo: true,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp()
      });
    }
    cerrarModal(modalForm);
    formEquipo.reset();
  } catch (error) {
    console.error("Error al guardar equipo:", error);
    errorForm.textContent = "No se pudo guardar. Intenta de nuevo.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

function leerFormulario() {
  return {
    clienteId: selectCliente.value,
    tipo: document.getElementById("equipo-tipo").value,
    modelo: document.getElementById("equipo-modelo").value.trim(),
    fechaInstalacion: document.getElementById("equipo-fecha").value || "",
    notas: document.getElementById("equipo-notas").value.trim()
  };
}

export function abrirNuevoEquipoParaCliente(clienteId) {
  abrirFormulario("nuevo", null, clienteId);
}

export function abrirDetalleEquipoPorId(id) {
  const equipo = equiposEnMemoria.get(id);
  if (equipo) abrirDetalle(equipo);
}

function abrirDetalle(equipo) {
  equipoEnDetalleId = equipo.id;
  abrirModal(modalDetalle);
  pintarDetalle(equipo);
}

function pintarDetalle(equipo) {
  const cliente = clientesParaEquipos.get(equipo.clienteId);
  tituloDetalle.textContent = `${getEtiquetaTipo(equipo.tipo)} — ${cliente?.nombre || "(sin cliente)"}`;
  const filas = [
    ["Cliente", cliente?.nombre || "(cliente eliminado)"],
    ["Tipo", getEtiquetaTipo(equipo.tipo)],
    ["Modelo", equipo.modelo || "—"],
    [
      "Fecha de instalación",
      equipo.fechaInstalacion ? formatearFecha(equipo.fechaInstalacion) : "—"
    ],
    ["Notas", equipo.notas || "—"],
    ["Estado", equipo.activo === false ? "Inactivo" : "Activo"]
  ];
  contenidoDetalle.innerHTML =
    filas
      .map(
        ([etiqueta]) => `
        <div class="fila">
          <span class="etiqueta">${etiqueta}</span>
          <span class="valor"></span>
        </div>
      `
      )
      .join("") +
    `
      <div class="subseccion-detalle">
        <div class="barra-acciones" style="margin-bottom: 8px;">
          <p class="subtitulo-detalle" style="margin:0;">Componentes y mantenimientos</p>
          <button id="btn-agregar-componente" class="boton-secundario" style="padding:4px 10px; font-size:12px;">+ Agregar</button>
        </div>
        <div id="lista-componentes-equipo" class="lista-componentes"></div>
      </div>
    `;
  const valores = contenidoDetalle.querySelectorAll(".fila .valor");
  filas.forEach(([, valor], i) => {
    valores[i].textContent = valor;
  });

  pintarComponentes(equipo);

  document
    .getElementById("btn-agregar-componente")
    .addEventListener("click", () => {
      abrirModalAgregarComponente(equipo);
    });
}

function pintarComponentes(equipo) {
  const contenedor = document.getElementById("lista-componentes-equipo");
  if (!contenedor) return;
  const componentes = Array.isArray(equipo.componentes)
    ? equipo.componentes
    : [];
  if (componentes.length === 0) {
    contenedor.innerHTML =
      '<p class="mensaje-vacio-pequeño">Aún no hay componentes. Agrega filtros, suavizador, sal, etc.</p>';
    return;
  }
  contenedor.innerHTML = "";
  componentes.forEach((comp, i) => {
    const proxima = calcularProximoMantenimiento(comp, equipo);
    const estado = estadoDeMantenimiento(proxima);
    const item = document.createElement("div");
    item.className = `item-componente ${estado.tipo}`;
    const etiquetaComp =
      COMPONENTES[comp.tipo]?.etiqueta || comp.tipo || "Componente";
    let textoEstado;
    if (estado.tipo === "vencido") {
      textoEstado = `Vencido hace ${estado.dias} día${estado.dias === 1 ? "" : "s"}`;
    } else if (estado.tipo === "proximo") {
      textoEstado = estado.dias === 0
        ? "Toca hoy"
        : `En ${estado.dias} día${estado.dias === 1 ? "" : "s"}`;
    } else {
      textoEstado = `Faltan ${estado.dias} días`;
    }
    item.innerHTML = `
      <div class="info-componente">
        <span class="nombre-componente"></span>
        <span class="meta-componente"></span>
        <span class="estado-componente"></span>
      </div>
      <div class="acciones-componente">
        <button type="button" class="boton-mini principal" data-accion="marcar">Marcar realizado</button>
        <button type="button" class="boton-mini" data-accion="editar">Editar</button>
        <button type="button" class="boton-mini peligro" data-accion="eliminar">Eliminar</button>
      </div>
    `;
    item.querySelector(".nombre-componente").textContent = etiquetaComp;
    const ultimo = comp.ultimoMantenimiento
      ? `Último: ${formatearFechaCorta(comp.ultimoMantenimiento)}`
      : "Sin mantenimiento previo";
    item.querySelector(".meta-componente").textContent =
      `${ultimo} — Cada ${comp.frecuenciaMeses} mes${comp.frecuenciaMeses === 1 ? "" : "es"} — Próximo: ${formatearFechaCorta(proxima)}`;
    item.querySelector(".estado-componente").textContent = textoEstado;

    item
      .querySelector('[data-accion="marcar"]')
      .addEventListener("click", async () => {
        try {
          await marcarMantenimientoRealizado(equipo, i);
        } catch (err) {
          console.error("Error al marcar mantenimiento:", err);
          window.alert("No se pudo marcar el mantenimiento.");
        }
      });
    item
      .querySelector('[data-accion="editar"]')
      .addEventListener("click", () => {
        abrirModalEditarComponente(equipo, i);
      });
    item
      .querySelector('[data-accion="eliminar"]')
      .addEventListener("click", async () => {
        const ok = window.confirm(
          `Eliminar "${etiquetaComp}" de este equipo?`
        );
        if (!ok) return;
        try {
          await eliminarComponente(equipo, i);
        } catch (err) {
          console.error("Error al eliminar componente:", err);
          window.alert("No se pudo eliminar.");
        }
      });
    contenedor.appendChild(item);
  });
}

function formatearFecha(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
