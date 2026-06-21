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
  getEquiposDeCliente,
  getEtiquetaTipo,
  onEquiposActualizados,
  abrirNuevoEquipoParaCliente,
  abrirDetalleEquipoPorId
} from "./equipos.js";
import { abrirModalNuevaNota, pintarHistorialNotas } from "./notas.js";

let mapaForm = null;
let pinForm = null;
const coordsDefaultCiudad = {
  Navojoa: [27.0742, -109.4437],
  Huatabampo: [26.8265, -109.6402],
  Etchojoa: [26.9111, -109.6306],
  Hermosillo: [29.0729, -110.9559],
  Otro: [27.0742, -109.4437]
};

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
    document.querySelector('input[name="venta-pagado"][value="pendiente"]').checked = true;
    document.getElementById("bloque-facturacion").classList.add("oculto");
    document.getElementById("seccion-venta-inicial").style.display = "";
    document.getElementById("geolocalizar-estado").textContent =
      "Escribe la dirección y dale al botón. Luego puedes mover el pin para ajustar.";
    abrirModal(modalForm);
    setTimeout(() => inicializarMapaForm(), 150);
    return;
  }

  tituloModalForm.textContent = "Editar cliente";
  btnGuardar.textContent = "Guardar cambios";
  document.getElementById("seccion-venta-inicial").style.display = "none";
  const enMemoria = clientesEnMemoria.get(id);
  if (enMemoria) {
    prellenarFormulario(enMemoria);
    abrirModal(modalForm);
    setTimeout(() => inicializarMapaForm(enMemoria.coordenadas), 150);
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
    setTimeout(() => inicializarMapaForm(snap.data().coordenadas), 150);
    btnGuardar.disabled = false;
  } catch (error) {
    console.error("Error al cargar cliente para editar:", error);
    errorForm.textContent = "No se pudo cargar el cliente.";
    btnGuardar.disabled = false;
  }
}

function inicializarMapaForm(coords = null) {
  const mapaDiv = document.getElementById("mapa-cliente-form");
  if (!mapaDiv || typeof window.L === "undefined") return;
  const ciudad = document.getElementById("nuevo-ciudad").value || "Navojoa";
  const inicial = coords && coords.lat
    ? [coords.lat, coords.lng]
    : coordsDefaultCiudad[ciudad] || coordsDefaultCiudad.Navojoa;

  if (mapaForm) {
    mapaForm.remove();
    mapaForm = null;
    pinForm = null;
  }
  mapaForm = window.L.map(mapaDiv).setView(inicial, coords ? 16 : 13);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(mapaForm);
  pinForm = window.L.marker(inicial, { draggable: true }).addTo(mapaForm);
  setTimeout(() => mapaForm.invalidateSize(), 100);
}

function obtenerCoordsPin() {
  if (!pinForm) return null;
  const { lat, lng } = pinForm.getLatLng();
  return { lat, lng };
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
  document.getElementById("nuevo-canal").value = cliente.canalEntrada || "";
  document.getElementById("nuevo-direccion-texto").value = cliente.direccion?.calle || "";
  document.getElementById("nuevo-colonia").value = cliente.direccion?.colonia || "";
  document.getElementById("nuevo-referencias").value = cliente.direccion?.referencias || "";
  const pide = !!cliente.requiereFactura;
  document.getElementById("nuevo-pide-factura").checked = pide;
  document.getElementById("bloque-facturacion").classList.toggle("oculto", !pide);
  document.getElementById("nuevo-razon-social").value = cliente.datosFiscales?.razonSocial || "";
  document.getElementById("nuevo-rfc").value = cliente.datosFiscales?.rfc || "";
  document.getElementById("nuevo-regimen").value = cliente.datosFiscales?.regimen || "";
  document.getElementById("nuevo-cp-fiscal").value = cliente.datosFiscales?.codigoPostal || "";
}

document.getElementById("nuevo-pide-factura").addEventListener("change", (e) => {
  document.getElementById("bloque-facturacion").classList.toggle("oculto", !e.target.checked);
});

document.getElementById("nuevo-ciudad").addEventListener("change", () => {
  if (mapaForm && !pinForm) return;
  const ciudad = document.getElementById("nuevo-ciudad").value;
  const coords = coordsDefaultCiudad[ciudad];
  if (coords && mapaForm && pinForm) {
    mapaForm.setView(coords, 13);
    pinForm.setLatLng(coords);
  }
});

document.getElementById("btn-geolocalizar").addEventListener("click", async () => {
  const estado = document.getElementById("geolocalizar-estado");
  const calle = document.getElementById("nuevo-direccion-texto").value.trim();
  const colonia = document.getElementById("nuevo-colonia").value.trim();
  const ciudad = document.getElementById("nuevo-ciudad").value;
  if (!calle && !colonia) {
    estado.textContent = "Escribe al menos calle o colonia para buscar.";
    return;
  }
  estado.textContent = "Buscando dirección...";
  const consulta = [calle, colonia, ciudad, "Sonora", "Mexico"].filter(Boolean).join(", ");
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}&limit=1`;
    const r = await fetch(url, { headers: { "Accept-Language": "es" } });
    const data = await r.json();
    if (!data || data.length === 0) {
      estado.textContent = "No se encontró la dirección exacta. Mueve el pin manualmente para fijar el punto.";
      return;
    }
    const { lat, lon } = data[0];
    const coords = [parseFloat(lat), parseFloat(lon)];
    if (mapaForm && pinForm) {
      mapaForm.setView(coords, 17);
      pinForm.setLatLng(coords);
    }
    estado.textContent = "Pin colocado. Muévelo si necesitas ajustar.";
  } catch (err) {
    console.error("Error al geolocalizar:", err);
    estado.textContent = "Error al buscar. Mueve el pin manualmente.";
  }
});

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
      const ref = await addDoc(collection(db, "clientes"), {
        ...datos,
        activo: true,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp()
      });
      await registrarVentaInicialSiCorresponde(ref.id, datos.requiereFactura);
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

async function registrarVentaInicialSiCorresponde(clienteId, requiereFactura) {
  const concepto = document.getElementById("nuevo-venta-concepto").value.trim();
  const monto = parseFloat(document.getElementById("nuevo-venta-monto").value) || 0;
  if (!concepto || !monto) return;
  const pagado = document.querySelector('input[name="venta-pagado"]:checked')?.value || "pendiente";
  const metodo = document.getElementById("nuevo-venta-metodo").value || null;
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  try {
    await addDoc(collection(db, "ventas"), {
      clienteId,
      tipo: "otro",
      concepto: `${concepto}\n\n(Venta inicial al registrar al cliente)`,
      fecha,
      monto,
      montoPagado: pagado === "pagado" ? monto : 0,
      estadoPago: pagado,
      metodoPago: metodo,
      fechaPago: pagado === "pagado" ? fecha : null,
      requiereFactura: !!requiereFactura,
      facturaEmitida: false,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
  } catch (err) {
    console.error("No se pudo registrar la venta inicial:", err);
  }
}

function leerFormulario() {
  const tipo =
    document.querySelector('input[name="tipo"]:checked')?.value ||
    "residencial";
  const pideFactura = !!document.getElementById("nuevo-pide-factura").checked;
  const coords = obtenerCoordsPin();
  return {
    tipo,
    nombre: document.getElementById("nuevo-nombre").value.trim(),
    telefono: document.getElementById("nuevo-telefono").value.trim(),
    ciudad: document.getElementById("nuevo-ciudad").value,
    notas: document.getElementById("nuevo-notas").value.trim(),
    canalEntrada: document.getElementById("nuevo-canal").value || null,
    direccion: {
      calle: document.getElementById("nuevo-direccion-texto").value.trim(),
      colonia: document.getElementById("nuevo-colonia").value.trim(),
      referencias: document.getElementById("nuevo-referencias").value.trim()
    },
    coordenadas: coords,
    requiereFactura: pideFactura,
    datosFiscales: pideFactura
      ? {
          razonSocial: document.getElementById("nuevo-razon-social").value.trim(),
          rfc: document.getElementById("nuevo-rfc").value.trim().toUpperCase(),
          regimen: document.getElementById("nuevo-regimen").value.trim(),
          codigoPostal: document.getElementById("nuevo-cp-fiscal").value.trim()
        }
      : null
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
          <p class="subtitulo-detalle" style="margin:0;">Equipos instalados</p>
          <button id="btn-nuevo-equipo-cliente" class="boton-secundario" style="padding:4px 10px; font-size:12px;">+ Agregar</button>
        </div>
        <div id="equipos-del-cliente" class="lista-equipos-cliente"></div>
      </div>
      <div class="subseccion-detalle">
        <div class="barra-acciones" style="margin-bottom: 8px;">
          <p class="subtitulo-detalle" style="margin:0;">Historial / Notas</p>
          <button id="btn-nueva-nota-cliente" class="boton-secundario" style="padding:4px 10px; font-size:12px;">+ Nueva nota</button>
        </div>
        <div id="notas-del-cliente" class="lista-notas"></div>
      </div>
    `;
  const valores = contenidoDetalle.querySelectorAll(".fila .valor");
  filas.forEach(([, valor], i) => {
    valores[i].textContent = valor;
  });

  pintarEquiposDelCliente(cliente.id);
  pintarNotasDelCliente(cliente);

  const btnAgregar = document.getElementById("btn-nuevo-equipo-cliente");
  if (btnAgregar) {
    btnAgregar.addEventListener("click", () => {
      cerrarModal(modalDetalle);
      abrirNuevoEquipoParaCliente(cliente.id);
    });
  }
  const btnNota = document.getElementById("btn-nueva-nota-cliente");
  if (btnNota) {
    btnNota.addEventListener("click", () => {
      abrirModalNuevaNota(cliente);
    });
  }
}

function pintarNotasDelCliente(cliente) {
  const contenedor = document.getElementById("notas-del-cliente");
  if (!contenedor) return;
  pintarHistorialNotas(contenedor, cliente);
}

function pintarEquiposDelCliente(clienteId) {
  const contenedor = document.getElementById("equipos-del-cliente");
  if (!contenedor) return;
  const equipos = getEquiposDeCliente(clienteId);
  if (equipos.length === 0) {
    contenedor.innerHTML =
      '<p class="mensaje-vacio-pequeño">Este cliente aún no tiene equipos registrados.</p>';
    return;
  }
  contenedor.innerHTML = "";
  for (const eq of equipos) {
    const item = document.createElement("div");
    item.className = "item-equipo-cliente";
    item.innerHTML = `
      <div class="titulo-equipo"></div>
      <div class="meta-equipo"></div>
    `;
    item.querySelector(".titulo-equipo").textContent = getEtiquetaTipo(eq.tipo);
    const partes = [];
    if (eq.modelo) partes.push(eq.modelo);
    if (eq.fechaInstalacion) {
      const [y, m, d] = eq.fechaInstalacion.split("-");
      partes.push(`Instalado ${d}/${m}/${y}`);
    }
    item.querySelector(".meta-equipo").textContent = partes.join(" — ");
    item.addEventListener("click", () => {
      cerrarModal(modalDetalle);
      abrirDetalleEquipoPorId(eq.id);
    });
    contenedor.appendChild(item);
  }
}

onEquiposActualizados(() => {
  if (clienteEnDetalleId) pintarEquiposDelCliente(clienteEnDetalleId);
});

window.addEventListener("abrir-cliente-desde-mapa", (e) => {
  const id = e.detail?.id;
  if (!id) return;
  const cliente = clientesEnMemoria.get(id);
  if (cliente) abrirDetalle(cliente);
});
