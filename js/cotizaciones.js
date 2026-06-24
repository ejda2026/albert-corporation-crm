import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";
import { getConfiguracion } from "./configuracion.js";
import { getProductos, onProductosActualizados } from "./catalogo.js";

const ESTADOS = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  expirada: "Expirada"
};

function nombreDeClienteCot(cot) {
  if (cot?.clienteId) {
    const c = clientesEnMemoria.get(cot.clienteId);
    if (c) return { nombre: c.nombre || "(sin nombre)", cliente: c, esLibre: false };
  }
  if (cot?.clienteNombreLibre) {
    return { nombre: cot.clienteNombreLibre, cliente: null, esLibre: true };
  }
  return { nombre: "(cliente)", cliente: null, esLibre: false };
}

const lista = document.getElementById("lista-cotizaciones");
const btnNueva = document.getElementById("btn-nueva-cotizacion");
const modalForm = document.getElementById("modal-form-cotizacion");
const modalDetalle = document.getElementById("modal-detalle-cotizacion");
const form = document.getElementById("form-cotizacion");
const tituloForm = document.getElementById("titulo-modal-form-cotizacion");
const tituloDetalle = document.getElementById("titulo-modal-detalle-cotizacion");
const contenidoDetalle = document.getElementById("contenido-detalle-cotizacion");
const btnGuardar = document.getElementById("btn-guardar-cotizacion");
const btnEditar = document.getElementById("btn-editar-cotizacion");
const btnEliminar = document.getElementById("btn-eliminar-cotizacion");
const btnImprimir = document.getElementById("btn-imprimir-cotizacion");
const btnWa = document.getElementById("btn-wa-cotizacion");
const btnEnviada = document.getElementById("btn-marcar-enviada");
const btnAprobada = document.getElementById("btn-marcar-aprobada");
const btnRechazada = document.getElementById("btn-marcar-rechazada");
const errorForm = document.getElementById("error-form-cotizacion");
const inputClienteBusqueda = document.getElementById("cot-cliente-busqueda");
const inputClienteId = document.getElementById("cot-cliente-id");
const sugerenciasBox = document.getElementById("cot-sugerencias");
const estadoCliente = document.getElementById("cot-cliente-estado");
const buscador = document.getElementById("buscador-cotizaciones");
const filtroEstado = document.getElementById("filtro-cot-estado");
const contador = document.getElementById("contador-cotizaciones");
const listaItems = document.getElementById("lista-items-cot");
const btnAgregarItem = document.getElementById("btn-agregar-item-cot");
const inputIncluyeIva = document.getElementById("cot-incluye-iva");
const elSubtotal = document.getElementById("cot-subtotal");
const elIva = document.getElementById("cot-iva");
const elTotal = document.getElementById("cot-total");
const filaIva = document.getElementById("cot-fila-iva");
const contenedorImpresion = document.getElementById("contenedor-impresion");
const selectCatalogoCot = document.getElementById("cot-catalogo-select");

function llenarCatalogoCot() {
  if (!selectCatalogoCot) return;
  selectCatalogoCot.innerHTML = '<option value="">+ Desde catálogo...</option>';
  const productos = (typeof getProductos === "function" ? getProductos() : []).slice().sort((a, b) =>
    (a.nombre || "").localeCompare(b.nombre || "")
  );
  for (const p of productos) {
    const opt = document.createElement("option");
    opt.value = p.id;
    const precio = Number(p.precio || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
    opt.textContent = `${p.nombre || "(sin nombre)"} — ${precio}`;
    opt.dataset.nombre = p.nombre || "";
    opt.dataset.precio = p.precio || 0;
    opt.dataset.unidad = p.unidad || "";
    selectCatalogoCot.appendChild(opt);
  }
}

if (selectCatalogoCot) {
  selectCatalogoCot.addEventListener("change", () => {
    const opt = selectCatalogoCot.options[selectCatalogoCot.selectedIndex];
    if (!opt || !opt.value) return;
    const nombre = opt.dataset.nombre;
    const precio = parseFloat(opt.dataset.precio) || 0;
    const unidad = opt.dataset.unidad;
    const desc = unidad ? `${nombre}` : nombre;
    agregarFilaItem({ descripcion: desc, cantidad: 1, precioUnit: precio });
    selectCatalogoCot.value = "";
  });
  if (typeof onProductosActualizados === "function") {
    onProductosActualizados(llenarCatalogoCot);
  }
  llenarCatalogoCot();
}

let cotizacionesEnMemoria = new Map();
let clientesEnMemoria = new Map();
let cotEnDetalleId = null;
let unsubCot = null;
let unsubClientes = null;

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribir();
  } else {
    if (unsubCot) { unsubCot(); unsubCot = null; }
    if (unsubClientes) { unsubClientes(); unsubClientes = null; }
  }
});

function suscribir() {
  if (!unsubCot) {
    const q = query(collection(db, "cotizaciones"), orderBy("fechaCreacion", "desc"));
    unsubCot = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cotizacionesEnMemoria = new Map(arr.map((c) => [c.id, c]));
      repintar();
      if (cotEnDetalleId && cotizacionesEnMemoria.has(cotEnDetalleId)) {
        pintarDetalle(cotizacionesEnMemoria.get(cotEnDetalleId));
      }
    });
  }
  if (!unsubClientes) {
    const q = query(collection(db, "clientes"), orderBy("nombre"));
    unsubClientes = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      clientesEnMemoria = new Map(arr.map((c) => [c.id, c]));
      llenarSelectClientes(arr);
      repintar();
    });
  }
}

function llenarSelectClientes() {
  // ya no es un select, este placeholder se mantiene para no romper otros llamados
}

inputClienteBusqueda.addEventListener("input", () => {
  inputClienteId.value = "";
  estadoCliente.textContent = "";
  mostrarSugerencias(inputClienteBusqueda.value.trim());
});

inputClienteBusqueda.addEventListener("focus", () => {
  if (inputClienteBusqueda.value.trim().length > 0) {
    mostrarSugerencias(inputClienteBusqueda.value.trim());
  }
});

inputClienteBusqueda.addEventListener("blur", () => {
  setTimeout(() => sugerenciasBox.classList.add("oculto"), 150);
  validarEstadoClienteVisual();
});

function mostrarSugerencias(texto) {
  const t = texto.toLowerCase();
  if (!t) {
    sugerenciasBox.classList.add("oculto");
    return;
  }
  const matches = Array.from(clientesEnMemoria.values())
    .filter((c) => (c.nombre || "").toLowerCase().includes(t))
    .slice(0, 8);

  sugerenciasBox.innerHTML = "";
  for (const c of matches) {
    const item = document.createElement("div");
    item.className = "sugerencia-item";
    item.dataset.id = c.id;
    item.innerHTML = `
      <div></div>
      <div class="meta"></div>
    `;
    item.querySelector("div").textContent = c.nombre || "(sin nombre)";
    item.querySelector(".meta").textContent =
      [c.tipo === "comercial" ? "Negocio" : "Casa", c.ciudad, c.telefono]
        .filter(Boolean)
        .join(" · ");
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      seleccionarCliente(c);
    });
    sugerenciasBox.appendChild(item);
  }

  const matchExacto = matches.some((c) => (c.nombre || "").toLowerCase() === t);
  if (!matchExacto) {
    const itemNuevo = document.createElement("div");
    itemNuevo.className = "sugerencia-item sugerencia-nuevo";
    itemNuevo.textContent = `+ Crear nuevo cliente: "${texto}"`;
    itemNuevo.addEventListener("mousedown", (e) => {
      e.preventDefault();
      inputClienteId.value = "";
      sugerenciasBox.classList.add("oculto");
      estadoCliente.textContent =
        "Cliente nuevo. Se creará al autorizar la cotización.";
      estadoCliente.style.color = "var(--color-exito)";
    });
    sugerenciasBox.appendChild(itemNuevo);
  }

  sugerenciasBox.classList.remove("oculto");
}

function seleccionarCliente(cliente) {
  inputClienteBusqueda.value = cliente.nombre || "";
  inputClienteId.value = cliente.id;
  sugerenciasBox.classList.add("oculto");
  estadoCliente.textContent = `Cliente existente seleccionado.`;
  estadoCliente.style.color = "var(--color-primario)";
}

function validarEstadoClienteVisual() {
  const nombre = inputClienteBusqueda.value.trim();
  if (!nombre) {
    estadoCliente.textContent = "";
    return;
  }
  if (inputClienteId.value) return;
  const matchExacto = Array.from(clientesEnMemoria.values()).find(
    (c) => (c.nombre || "").toLowerCase() === nombre.toLowerCase()
  );
  if (matchExacto) {
    seleccionarCliente(matchExacto);
  } else {
    estadoCliente.textContent =
      "Cliente nuevo. Se creará al autorizar la cotización.";
    estadoCliente.style.color = "var(--color-exito)";
  }
}

function repintar() {
  const todas = Array.from(cotizacionesEnMemoria.values()).map(actualizarExpirada);
  const filtradas = aplicarFiltros(todas);
  if (todas.length === 0) {
    contador.textContent = "";
    lista.innerHTML = '<p class="mensaje-vacio">Aún no hay cotizaciones. Crea la primera con el botón de arriba.</p>';
    return;
  }
  contador.textContent =
    filtradas.length === todas.length ? `(${todas.length})` : `(${filtradas.length} de ${todas.length})`;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="mensaje-vacio">No hay cotizaciones con esos filtros.</p>';
    return;
  }
  lista.innerHTML = "";
  for (const c of filtradas) lista.appendChild(crearItem(c));
}

function actualizarExpirada(c) {
  if (c.estado === "enviada" && c.fechaVigenciaIso) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const [y,m,d] = c.fechaVigenciaIso.split("-").map(Number);
    const vig = new Date(y, m-1, d);
    if (vig < hoy) return { ...c, estado: "expirada" };
  }
  return c;
}

function aplicarFiltros(arr) {
  const t = (buscador.value || "").trim().toLowerCase();
  const e = filtroEstado.value;
  return arr.filter((c) => {
    if (e && c.estado !== e) return false;
    if (t) {
      const info = nombreDeClienteCot(c);
      const blob = [info.nombre, c.titulo || "", c.folio || "", c.notas || "",
        ...(c.items || []).map(i => i.descripcion || "")
      ].join(" ").toLowerCase();
      if (!blob.includes(t)) return false;
    }
    return true;
  });
}

function crearItem(c) {
  const info = nombreDeClienteCot(c);
  const cliente = info.cliente;
  const item = document.createElement("div");
  item.className = "item-componente";
  item.innerHTML = `
    <div class="info-componente">
      <span class="nombre-componente"></span>
      <span class="meta-componente"></span>
      <span class="estado-componente"></span>
    </div>
    <div class="acciones-componente">
      <span class="etiqueta-estado-cot ${c.estado}">${ESTADOS[c.estado] || c.estado}</span>
      <button type="button" class="boton-mini" data-accion="ver">Detalle</button>
    </div>
  `;
  const sufijoNuevo = info.esLibre ? " (NUEVO)" : "";
  item.querySelector(".nombre-componente").textContent =
    `${c.folio || ""} ${info.nombre}${sufijoNuevo}`.trim();
  item.querySelector(".meta-componente").textContent =
    `${c.titulo || "Sin título"} · ${moneda(c.total)}`;
  item.querySelector(".estado-componente").textContent =
    `Creada: ${formatearFecha(c.fechaCreacionIso)}${c.fechaVigenciaIso ? " · Vigencia: " + formatearFecha(c.fechaVigenciaIso) : ""}`;
  item.querySelector('[data-accion="ver"]').addEventListener("click", () => abrirDetalle(c));
  item.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirDetalle(c);
  });
  return item;
}

for (const el of [buscador, filtroEstado]) {
  el.addEventListener("input", repintar);
  el.addEventListener("change", repintar);
}

btnNueva.addEventListener("click", () => abrirFormulario("nuevo"));
btnAgregarItem.addEventListener("click", () => agregarFilaItem());
inputIncluyeIva.addEventListener("change", () => {
  filaIva.style.display = inputIncluyeIva.checked ? "" : "none";
  recalcularTotales();
});

for (const el of modalForm.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => modalForm.classList.add("oculto"));
}
for (const el of modalDetalle.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => modalDetalle.classList.add("oculto"));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    modalForm.classList.add("oculto");
    modalDetalle.classList.add("oculto");
  }
});

function abrirFormulario(modo, cot = null) {
  form.dataset.modo = modo;
  form.dataset.id = cot?.id || "";
  errorForm.textContent = "";
  listaItems.innerHTML = "";
  if (modo === "nuevo") {
    tituloForm.textContent = "Nueva cotización";
    btnGuardar.textContent = "Guardar cotización";
    form.reset();
    inputClienteBusqueda.value = "";
    inputClienteId.value = "";
    estadoCliente.textContent = "";
    inputIncluyeIva.checked = true;
    document.getElementById("cot-vigencia").value = 15;
    agregarFilaItem();
  } else {
    tituloForm.textContent = "Editar cotización";
    btnGuardar.textContent = "Guardar cambios";
    if (cot.clienteId) {
      const c = clientesEnMemoria.get(cot.clienteId);
      inputClienteBusqueda.value = c?.nombre || cot.clienteNombreLibre || "";
      inputClienteId.value = cot.clienteId;
      estadoCliente.textContent = c ? "Cliente existente." : "Cliente fue eliminado.";
      estadoCliente.style.color = c ? "var(--color-primario)" : "var(--color-error)";
    } else {
      inputClienteBusqueda.value = cot.clienteNombreLibre || "";
      inputClienteId.value = "";
      estadoCliente.textContent =
        "Cliente nuevo (sin registrar). Se creará al autorizar la cotización.";
      estadoCliente.style.color = "var(--color-exito)";
    }
    document.getElementById("cot-titulo").value = cot.titulo || "";
    document.getElementById("cot-vigencia").value = cot.vigenciaDias || 15;
    document.getElementById("cot-notas").value = cot.notas || "";
    inputIncluyeIva.checked = !!cot.incluyeIva;
    filaIva.style.display = cot.incluyeIva ? "" : "none";
    for (const it of cot.items || []) agregarFilaItem(it);
    if ((cot.items || []).length === 0) agregarFilaItem();
  }
  recalcularTotales();
  modalForm.classList.remove("oculto");
}

function agregarFilaItem(item = null) {
  const fila = document.createElement("div");
  fila.className = "item-cot";
  fila.innerHTML = `
    <input type="text" class="desc-item" placeholder="Descripción del concepto" maxlength="200" />
    <input type="number" class="cant-item" min="0" step="0.01" placeholder="Cant." />
    <input type="number" class="precio-item" min="0" step="0.01" placeholder="Precio unit." />
    <input type="text" class="total-item" readonly placeholder="Total" />
    <button type="button" class="quitar-item" title="Quitar">&times;</button>
  `;
  if (item) {
    fila.querySelector(".desc-item").value = item.descripcion || "";
    fila.querySelector(".cant-item").value = item.cantidad || "";
    fila.querySelector(".precio-item").value = item.precioUnit || "";
  }
  fila.querySelector(".cant-item").addEventListener("input", recalcularTotales);
  fila.querySelector(".precio-item").addEventListener("input", recalcularTotales);
  fila.querySelector(".quitar-item").addEventListener("click", () => {
    fila.remove();
    recalcularTotales();
  });
  listaItems.appendChild(fila);
  recalcularTotales();
}

function recalcularTotales() {
  let subtotal = 0;
  for (const fila of listaItems.querySelectorAll(".item-cot")) {
    const cant = parseFloat(fila.querySelector(".cant-item").value) || 0;
    const precio = parseFloat(fila.querySelector(".precio-item").value) || 0;
    const total = cant * precio;
    fila.querySelector(".total-item").value = total ? moneda(total) : "";
    subtotal += total;
  }
  const incluyeIva = inputIncluyeIva.checked;
  const iva = incluyeIva ? subtotal * 0.16 : 0;
  const total = subtotal + iva;
  elSubtotal.textContent = moneda(subtotal);
  elIva.textContent = moneda(iva);
  elTotal.textContent = moneda(total);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  const items = leerItems();
  const nombreCliente = inputClienteBusqueda.value.trim();
  if (!nombreCliente) {
    errorForm.textContent = "Escribe el nombre del cliente.";
    return;
  }
  if (items.length === 0) { errorForm.textContent = "Agrega al menos un concepto."; return; }
  const vigenciaDias = parseInt(document.getElementById("cot-vigencia").value, 10) || 15;
  const incluyeIva = inputIncluyeIva.checked;
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const iva = incluyeIva ? subtotal * 0.16 : 0;
  const total = subtotal + iva;
  const hoy = hoyISO();
  const vig = sumarDias(hoy, vigenciaDias);

  let clienteId = inputClienteId.value || null;
  if (!clienteId) {
    const match = Array.from(clientesEnMemoria.values()).find(
      (c) => (c.nombre || "").toLowerCase() === nombreCliente.toLowerCase()
    );
    if (match) clienteId = match.id;
  }

  const datos = {
    clienteId: clienteId || null,
    clienteNombreLibre: clienteId ? null : nombreCliente,
    titulo: document.getElementById("cot-titulo").value.trim(),
    items,
    incluyeIva,
    subtotal,
    iva,
    total,
    vigenciaDias,
    notas: document.getElementById("cot-notas").value.trim(),
    fechaCreacionIso: hoy,
    fechaVigenciaIso: vig,
    fechaActualizacion: serverTimestamp()
  };

  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";
  try {
    const modo = form.dataset.modo;
    const id = form.dataset.id;
    if (modo === "editar" && id) {
      await updateDoc(doc(db, "cotizaciones", id), datos);
    } else {
      const folio = await generarFolio();
      await addDoc(collection(db, "cotizaciones"), {
        ...datos,
        folio,
        estado: "borrador",
        fechaCreacion: serverTimestamp()
      });
    }
    modalForm.classList.add("oculto");
  } catch (err) {
    console.error("Error al guardar cotización:", err);
    errorForm.textContent = "No se pudo guardar.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

function leerItems() {
  const items = [];
  for (const fila of listaItems.querySelectorAll(".item-cot")) {
    const desc = fila.querySelector(".desc-item").value.trim();
    const cant = parseFloat(fila.querySelector(".cant-item").value) || 0;
    const precio = parseFloat(fila.querySelector(".precio-item").value) || 0;
    if (!desc || cant <= 0 || precio < 0) continue;
    items.push({ descripcion: desc, cantidad: cant, precioUnit: precio, total: cant * precio });
  }
  return items;
}

async function generarFolio() {
  const anio = new Date().getFullYear();
  let max = 0;
  for (const c of cotizacionesEnMemoria.values()) {
    if (c.folio && c.folio.startsWith(`AC-${anio}-`)) {
      const n = parseInt(c.folio.split("-")[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
    if (c.folio && c.folio.startsWith(`COT-${anio}-`)) {
      const n = parseInt(c.folio.split("-")[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  const siguiente = String(max + 1).padStart(4, "0");
  return `AC-${anio}-${siguiente}`;
}

const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function formatearFechaLarga(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d, 10)} / ${MESES_CORTOS[parseInt(m, 10) - 1]} / ${y}`;
}

function numeroALetras(num) {
  const entero = Math.floor(num);
  const cent = Math.round((num - entero) * 100);
  const letras = enteroALetras(entero);
  const centStr = String(cent).padStart(2, "0");
  return `${capitalizar(letras)} pesos ${centStr}/100 M.N.`;
}

function capitalizar(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function enteroALetras(n) {
  if (n === 0) return "cero";
  if (n < 0) return "menos " + enteroALetras(-n);
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    const r = n % 1000000;
    const mLetras = m === 1 ? "un millón" : `${enteroALetras(m)} millones`;
    return r === 0 ? mLetras : `${mLetras} ${enteroALetras(r)}`;
  }
  if (n >= 1000) {
    const m = Math.floor(n / 1000);
    const r = n % 1000;
    const mLetras = m === 1 ? "mil" : `${enteroALetras(m)} mil`;
    return r === 0 ? mLetras : `${mLetras} ${enteroALetras(r)}`;
  }
  return centenasALetras(n);
}

function centenasALetras(n) {
  const unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales = {
    10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
    16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
    20: "veinte", 30: "treinta", 40: "cuarenta", 50: "cincuenta",
    60: "sesenta", 70: "setenta", 80: "ochenta", 90: "noventa",
    100: "cien"
  };
  const centenas = {
    100: "ciento", 200: "doscientos", 300: "trescientos", 400: "cuatrocientos",
    500: "quinientos", 600: "seiscientos", 700: "setecientos",
    800: "ochocientos", 900: "novecientos"
  };
  if (n < 10) return unidades[n];
  if (especiales[n]) return especiales[n];
  if (n < 30) return "veinti" + unidades[n - 20];
  if (n < 100) {
    const d = Math.floor(n / 10) * 10;
    const u = n % 10;
    return u === 0 ? especiales[d] : `${especiales[d]} y ${unidades[u]}`;
  }
  if (n === 100) return "cien";
  const c = Math.floor(n / 100) * 100;
  const r = n % 100;
  return r === 0 ? centenas[c] : `${centenas[c]} ${centenasALetras(r)}`;
}

btnEditar.addEventListener("click", () => {
  if (!cotEnDetalleId) return;
  const c = cotizacionesEnMemoria.get(cotEnDetalleId);
  if (!c) return;
  modalDetalle.classList.add("oculto");
  abrirFormulario("editar", c);
});

btnEliminar.addEventListener("click", async () => {
  if (!cotEnDetalleId) return;
  if (!window.confirm("¿Eliminar esta cotización?")) return;
  try {
    await deleteDoc(doc(db, "cotizaciones", cotEnDetalleId));
    modalDetalle.classList.add("oculto");
  } catch (err) {
    console.error(err);
    window.alert("No se pudo eliminar.");
  }
});

btnEnviada.addEventListener("click", () => cambiarEstado("enviada"));
btnRechazada.addEventListener("click", () => cambiarEstado("rechazada"));

btnAprobada.addEventListener("click", async () => {
  if (!cotEnDetalleId) return;
  const c = cotizacionesEnMemoria.get(cotEnDetalleId);
  if (!c) return;
  const esClienteNuevo = !c.clienteId && c.clienteNombreLibre;
  const mensajeConfirm = esClienteNuevo
    ? `Autorizar la cotización?\n\nSe creará un nuevo cliente "${c.clienteNombreLibre}" con los datos disponibles y se le asignará una venta pendiente por el total.`
    : "Autorizar la cotización y crear una venta pendiente con el total?";
  if (!window.confirm(mensajeConfirm)) return;
  try {
    let clienteIdFinal = c.clienteId;
    if (!clienteIdFinal && c.clienteNombreLibre) {
      const refCliente = await addDoc(collection(db, "clientes"), {
        nombre: c.clienteNombreLibre,
        tipo: "comercial",
        telefono: "",
        ciudad: "Navojoa",
        notas: `Cliente creado al autorizar cotización ${c.folio || ""}.`,
        canalEntrada: null,
        direccion: { calle: "", colonia: "", referencias: "" },
        coordenadas: null,
        requiereFactura: false,
        datosFiscales: null,
        activo: true,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp()
      });
      clienteIdFinal = refCliente.id;
    }
    await addDoc(collection(db, "ventas"), {
      clienteId: clienteIdFinal,
      tipo: "venta-equipo",
      concepto: `Cotización autorizada ${c.folio || ""}: ${c.titulo || ""}`,
      fecha: hoyISO(),
      monto: c.total || 0,
      montoPagado: 0,
      estadoPago: "pendiente",
      metodoPago: null,
      requiereFactura: false,
      facturaEmitida: false,
      cotizacionId: cotEnDetalleId,
      notas: `Generada desde cotización ${c.folio || ""}.`,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
    await updateDoc(doc(db, "cotizaciones", cotEnDetalleId), {
      clienteId: clienteIdFinal,
      clienteNombreLibre: null,
      estado: "aprobada",
      fechaActualizacion: serverTimestamp()
    });
    window.alert(
      esClienteNuevo
        ? "Cotización autorizada. Cliente creado y venta agregada a su vitácora."
        : "Cotización autorizada y venta creada en estado pendiente de cobro."
    );
  } catch (err) {
    console.error(err);
    window.alert("No se pudo autorizar.");
  }
});

async function cambiarEstado(nuevo) {
  if (!cotEnDetalleId) return;
  try {
    await updateDoc(doc(db, "cotizaciones", cotEnDetalleId), {
      estado: nuevo,
      fechaActualizacion: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    window.alert("No se pudo actualizar el estado.");
  }
}

btnImprimir.addEventListener("click", () => {
  if (!cotEnDetalleId) return;
  const c = cotizacionesEnMemoria.get(cotEnDetalleId);
  if (!c) return;
  prepararImpresion(c);
  setTimeout(() => window.print(), 50);
});

btnWa.addEventListener("click", () => {
  if (!cotEnDetalleId) return;
  const c = cotizacionesEnMemoria.get(cotEnDetalleId);
  if (!c) return;
  const info = nombreDeClienteCot(c);
  const cliente = info.cliente;
  if (!cliente?.telefono) {
    window.alert(
      info.esLibre
        ? "Este es un cliente nuevo sin teléfono registrado. Autoriza la cotización para crearlo y luego agrégale el teléfono."
        : "El cliente no tiene teléfono registrado."
    );
    return;
  }
  const config = getConfiguracion();
  const negocio = config.nombreNegocio || "Albert Corporation";
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "";
  const saludo = nombreCorto ? `Hola ${nombreCorto},` : "Hola,";
  const mensaje = `${saludo} le envío la cotización ${c.folio || ""} de ${negocio}: ${c.titulo || ""} por un total de ${moneda(c.total)}. Vigencia: ${formatearFecha(c.fechaVigenciaIso)}. ¿Necesita más detalle?\n\nGracias por su interés.`;
  const num = normalizarTelefono(cliente.telefono);
  if (!num) { window.alert("El teléfono no es válido."); return; }
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`, "_blank");
});

function normalizarTelefono(tel) {
  if (!tel) return null;
  const limpio = String(tel).replace(/\D/g, "");
  if (limpio.length === 10) return "52" + limpio;
  if (limpio.length === 12 && limpio.startsWith("52")) return limpio;
  return null;
}

function abrirDetalle(c) {
  cotEnDetalleId = c.id;
  modalDetalle.classList.remove("oculto");
  pintarDetalle(c);
}

function pintarDetalle(c) {
  const info = nombreDeClienteCot(c);
  const cliente = info.cliente;
  tituloDetalle.textContent = `${c.folio || "Cotización"} — ${info.nombre}${info.esLibre ? " (cliente nuevo)" : ""}`;
  const tablaItems = (c.items || []).map(i => `
    <div class="fila">
      <span class="etiqueta">${i.cantidad} × ${escapar(i.descripcion)}</span>
      <span class="valor">${moneda(i.total)}</span>
    </div>
  `).join("");
  contenidoDetalle.innerHTML = `
    <div class="fila"><span class="etiqueta">Estado</span><span class="valor"><span class="etiqueta-estado-cot ${c.estado}">${ESTADOS[c.estado] || c.estado}</span></span></div>
    <div class="fila"><span class="etiqueta">Cliente</span><span class="valor">${escapar(info.nombre)}${info.esLibre ? ' <span style="color:var(--color-exito); font-size:11px;">(se creará al autorizar)</span>' : ""}</span></div>
    <div class="fila"><span class="etiqueta">Título</span><span class="valor">${escapar(c.titulo || "—")}</span></div>
    <div class="fila"><span class="etiqueta">Creada</span><span class="valor">${formatearFecha(c.fechaCreacionIso)}</span></div>
    <div class="fila"><span class="etiqueta">Vigencia</span><span class="valor">${formatearFecha(c.fechaVigenciaIso)} (${c.vigenciaDias} días)</span></div>
    <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--color-borde);">
      <strong style="display:block; margin-bottom:6px; font-size:13px;">Conceptos</strong>
      ${tablaItems || '<p class="mensaje-vacio-pequeño">Sin conceptos.</p>'}
    </div>
    <div class="fila" style="margin-top:8px;"><span class="etiqueta">Subtotal</span><span class="valor">${moneda(c.subtotal)}</span></div>
    ${c.incluyeIva ? `<div class="fila"><span class="etiqueta">IVA (16%)</span><span class="valor">${moneda(c.iva)}</span></div>` : ""}
    <div class="fila"><span class="etiqueta"><strong>Total</strong></span><span class="valor"><strong>${moneda(c.total)}</strong></span></div>
    ${c.notas ? `<div class="fila"><span class="etiqueta">Notas</span><span class="valor">${escapar(c.notas)}</span></div>` : ""}
  `;
  ajustarBotonesEstado(c.estado);
}

function ajustarBotonesEstado(estado) {
  btnEnviada.style.display = ["borrador"].includes(estado) ? "" : "none";
  btnAprobada.style.display = ["borrador","enviada","expirada"].includes(estado) ? "" : "none";
  btnRechazada.style.display = ["borrador","enviada","expirada"].includes(estado) ? "" : "none";
}

const LOGO_HTML = `<img src="assets/logo-albert.png?v=24" alt="Albert Corporations" class="cot-print-logo-img" />`;

function prepararImpresion(c) {
  const info = nombreDeClienteCot(c);
  const cliente = info.cliente;
  const config = getConfiguracion();
  const negocio = (config.nombreNegocio || "ALBERT CORPORATIONS").toUpperCase();

  const filas = (c.items || []).map(i => {
    const lineas = (i.descripcion || "").split("\n");
    const cuerpo = lineas
      .map((l, idx) =>
        idx === 0
          ? `<strong>${escapar(l)}</strong>`
          : escapar(l)
      )
      .join("<br/>");
    return `
      <tr>
        <td class="concepto-cell">${cuerpo}</td>
        <td class="num cant-cell"><strong>${i.cantidad}</strong></td>
        <td class="num imp-cell"><strong>${moneda(i.precioUnit * i.cantidad)}</strong></td>
      </tr>
    `;
  }).join("");

  const totalLetras = numeroALetras(c.total || 0);
  const ivaLeyenda = c.incluyeIva ? "IVA incluido" : "Más IVA";

  contenedorImpresion.innerHTML = `
    <div class="cot-print">
      <header class="cot-print-header">
        <div class="cot-print-logo">
          ${LOGO_HTML}
        </div>
        <div class="cot-print-titulo">
          <h1>C O T I Z A C I Ó N</h1>
          <p>Folio <strong>${escapar(c.folio || "")}</strong></p>
        </div>
      </header>

      <div class="cot-print-linea-degradado"></div>

      <div class="cot-print-meta">
        <div class="cot-print-meta-izq">
          ${info.nombre ? `<p><strong>${escapar(info.nombre)}</strong></p>` : ""}
          <p>${escapar(cliente?.ciudad || "Navojoa")}, Sonora</p>
        </div>
        <div class="cot-print-meta-der">
          <p><span>Fecha de emisión</span> <strong>${formatearFechaLarga(c.fechaCreacionIso)}</strong></p>
          <p>${c.vigenciaDias || 15} días naturales</p>
          <p>MXN (Pesos) ${escapar(negocio.split(" ").map(w => w[0] + w.slice(1).toLowerCase()).join(" "))}</p>
        </div>
      </div>

      ${c.titulo ? `<p class="cot-print-asunto"><strong>${escapar(c.titulo)}</strong></p>` : ""}

      <table class="cot-print-tabla">
        <thead>
          <tr>
            <th>CONCEPTO</th>
            <th class="num">CANT.</th>
            <th class="num">IMPORTE</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <div class="cot-print-total-box">
        <div class="cot-print-total-row">
          <span class="cot-print-total-label">T O T A L</span>
          <span class="cot-print-total-num">${moneda(c.total)}</span>
        </div>
        <p class="cot-print-total-letras">(${escapar(totalLetras)}) — ${ivaLeyenda}</p>
      </div>

      <section class="cot-print-condiciones">
        <h2>C O N D I C I O N E S</h2>
        <ul>
          <li>${c.incluyeIva ? "Los precios ya incluyen IVA del 16%." : "Los precios NO incluyen IVA, se agregará el 16% correspondiente."}</li>
          <li>Esta cotización tiene una vigencia de ${c.vigenciaDias || 15} días naturales a partir de la fecha de emisión.</li>
          <li>Cualquier refacción o trabajo adicional no contemplado se cotiza por separado.</li>
          <li>Tiempo de entrega sujeto a disponibilidad de proveedor.</li>
          ${c.notas ? `<li>${escapar(c.notas)}</li>` : ""}
        </ul>
      </section>

      <div class="cot-print-linea-degradado"></div>

      <footer class="cot-print-footer">
        <span><strong>${escapar(negocio)}</strong> · ${escapar(cliente?.ciudad || "Navojoa")}, Sonora, México</span>
        <span>Gracias por su preferencia</span>
      </footer>
    </div>
  `;
}

function escapar(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function moneda(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2
  });
}

function formatearFecha(iso) {
  if (!iso) return "—";
  const [y,m,d] = iso.split("-");
  if (!y||!m||!d) return iso;
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function sumarDias(iso, dias) {
  const [y,m,d] = iso.split("-").map(Number);
  const f = new Date(y, m-1, d);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,"0")}-${String(f.getDate()).padStart(2,"0")}`;
}
