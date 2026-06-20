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

const ESTADOS = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  expirada: "Expirada"
};

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
const selectCliente = document.getElementById("cot-cliente");
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

function llenarSelectClientes(clientes) {
  const valor = selectCliente.value;
  selectCliente.innerHTML = '<option value="">Selecciona un cliente...</option>';
  for (const c of clientes) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.nombre || "(sin nombre)";
    selectCliente.appendChild(opt);
  }
  if (valor) selectCliente.value = valor;
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
      const cliente = clientesEnMemoria.get(c.clienteId);
      const blob = [cliente?.nombre || "", c.titulo || "", c.folio || "", c.notas || "",
        ...(c.items || []).map(i => i.descripcion || "")
      ].join(" ").toLowerCase();
      if (!blob.includes(t)) return false;
    }
    return true;
  });
}

function crearItem(c) {
  const cliente = clientesEnMemoria.get(c.clienteId);
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
  item.querySelector(".nombre-componente").textContent =
    `${c.folio || ""} ${cliente?.nombre || "(cliente)"}`.trim();
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
    inputIncluyeIva.checked = true;
    document.getElementById("cot-vigencia").value = 15;
    agregarFilaItem();
  } else {
    tituloForm.textContent = "Editar cotización";
    btnGuardar.textContent = "Guardar cambios";
    selectCliente.value = cot.clienteId || "";
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
  if (!selectCliente.value) { errorForm.textContent = "Selecciona un cliente."; return; }
  if (items.length === 0) { errorForm.textContent = "Agrega al menos un concepto."; return; }
  const vigenciaDias = parseInt(document.getElementById("cot-vigencia").value, 10) || 15;
  const incluyeIva = inputIncluyeIva.checked;
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const iva = incluyeIva ? subtotal * 0.16 : 0;
  const total = subtotal + iva;
  const hoy = hoyISO();
  const vig = sumarDias(hoy, vigenciaDias);

  const datos = {
    clienteId: selectCliente.value,
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
    if (c.folio && c.folio.startsWith(`COT-${anio}-`)) {
      const n = parseInt(c.folio.split("-")[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  const siguiente = String(max + 1).padStart(4, "0");
  return `COT-${anio}-${siguiente}`;
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
  if (!window.confirm("Aprobar la cotización y crear una venta pendiente con el total?")) return;
  try {
    await addDoc(collection(db, "ventas"), {
      clienteId: c.clienteId,
      tipo: "venta-equipo",
      concepto: `Cotización aprobada ${c.folio || ""}: ${c.titulo || ""}`,
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
      estado: "aprobada",
      fechaActualizacion: serverTimestamp()
    });
    window.alert("Cotización aprobada y venta creada en estado pendiente de cobro.");
  } catch (err) {
    console.error(err);
    window.alert("No se pudo aprobar.");
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
  const cliente = clientesEnMemoria.get(c.clienteId);
  if (!cliente?.telefono) {
    window.alert("El cliente no tiene teléfono registrado.");
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
  const cliente = clientesEnMemoria.get(c.clienteId);
  tituloDetalle.textContent = `${c.folio || "Cotización"} — ${cliente?.nombre || "(cliente)"}`;
  const tablaItems = (c.items || []).map(i => `
    <div class="fila">
      <span class="etiqueta">${i.cantidad} × ${escapar(i.descripcion)}</span>
      <span class="valor">${moneda(i.total)}</span>
    </div>
  `).join("");
  contenidoDetalle.innerHTML = `
    <div class="fila"><span class="etiqueta">Estado</span><span class="valor"><span class="etiqueta-estado-cot ${c.estado}">${ESTADOS[c.estado] || c.estado}</span></span></div>
    <div class="fila"><span class="etiqueta">Cliente</span><span class="valor">${escapar(cliente?.nombre || "(cliente eliminado)")}</span></div>
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

function prepararImpresion(c) {
  const cliente = clientesEnMemoria.get(c.clienteId);
  const config = getConfiguracion();
  const negocio = config.nombreNegocio || "Albert Corporation";
  const filas = (c.items || []).map(i => `
    <tr>
      <td>${escapar(i.descripcion)}</td>
      <td class="num">${i.cantidad}</td>
      <td class="num">${moneda(i.precioUnit)}</td>
      <td class="num">${moneda(i.total)}</td>
    </tr>
  `).join("");
  contenedorImpresion.innerHTML = `
    <div class="cot-print-cabecera">
      <div class="cot-print-negocio">
        <h1>${escapar(negocio)}</h1>
        ${config.razonSocial ? `<p>${escapar(config.razonSocial)}</p>` : ""}
        ${config.rfc ? `<p>RFC: ${escapar(config.rfc)}</p>` : ""}
        ${config.regimen ? `<p>${escapar(config.regimen)}</p>` : ""}
        ${config.codigoPostal ? `<p>CP: ${escapar(config.codigoPostal)}</p>` : ""}
        ${config.direccion ? `<p>${escapar(config.direccion)}</p>` : ""}
        ${config.telefono ? `<p>Tel: ${escapar(config.telefono)}</p>` : ""}
        ${config.email ? `<p>${escapar(config.email)}</p>` : ""}
      </div>
      <div class="cot-print-info">
        <h2>COTIZACIÓN</h2>
        <p><strong>${escapar(c.folio || "")}</strong></p>
        <p>Fecha: ${formatearFecha(c.fechaCreacionIso)}</p>
        <p>Vigencia: ${formatearFecha(c.fechaVigenciaIso)}</p>
      </div>
    </div>

    <div class="cot-print-cliente">
      <h3>Cliente</h3>
      <p>${escapar(cliente?.nombre || "—")}</p>
      ${cliente?.telefono ? `<p style="margin-top:2px; font-weight:400; font-size:12px;">Tel: ${escapar(cliente.telefono)}</p>` : ""}
      ${cliente?.ciudad ? `<p style="margin-top:2px; font-weight:400; font-size:12px;">${escapar(cliente.ciudad)}</p>` : ""}
    </div>

    ${c.titulo ? `<h3 style="margin: 0 0 10px 0; font-size:14px;">${escapar(c.titulo)}</h3>` : ""}

    <table class="cot-print-tabla">
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="num">Cant.</th>
          <th class="num">Precio unit.</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <div class="cot-print-totales">
      <div><span>Subtotal:</span> <span>${moneda(c.subtotal)}</span></div>
      ${c.incluyeIva ? `<div><span>IVA (16%):</span> <span>${moneda(c.iva)}</span></div>` : ""}
      <div class="cot-print-total"><span>Total:</span> <span>${moneda(c.total)}</span></div>
    </div>

    ${c.notas ? `<div class="cot-print-notas"><strong>Notas:</strong> ${escapar(c.notas)}</div>` : ""}

    <div class="cot-print-pie">
      Esta cotización es válida hasta el ${formatearFecha(c.fechaVigenciaIso)}.
      Cualquier duda, contáctenos al ${escapar(config.telefono || "")}.
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
