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
import { enviarRecordatorioCobro } from "./whatsapp.js";

const TIPOS = {
  insumo: "Insumo",
  servicio: "Servicio",
  "venta-equipo": "Venta de equipo",
  otro: "Otro"
};

const lista = document.getElementById("lista-ventas");
const btnNueva = document.getElementById("btn-nueva-venta");
const modalForm = document.getElementById("modal-form-venta");
const modalDetalle = document.getElementById("modal-detalle-venta");
const form = document.getElementById("form-venta");
const tituloForm = document.getElementById("titulo-modal-form-venta");
const tituloDetalle = document.getElementById("titulo-modal-detalle-venta");
const contenidoDetalle = document.getElementById("contenido-detalle-venta");
const btnGuardar = document.getElementById("btn-guardar-venta");
const btnEditar = document.getElementById("btn-editar-venta");
const btnEliminar = document.getElementById("btn-eliminar-venta");
const btnMarcarPagada = document.getElementById("btn-marcar-pagada");
const errorForm = document.getElementById("error-form-venta");
const selectCliente = document.getElementById("venta-cliente");
const inputFecha = document.getElementById("venta-fecha");
const buscador = document.getElementById("buscador-ventas");
const filtroEstado = document.getElementById("filtro-venta-estado");
const filtroMetodo = document.getElementById("filtro-venta-metodo");
const filtroFactura = document.getElementById("filtro-venta-factura");
const contador = document.getElementById("contador-ventas");

const tieneListaTab = !!lista;

let ventasEnMemoria = new Map();
let clientesEnMemoria = new Map();
let ventaEnDetalleId = null;
let unsubVentas = null;
let unsubClientes = null;
const listenersExternos = new Set();

export function getVentasDeCliente(clienteId) {
  return Array.from(ventasEnMemoria.values()).filter(
    (v) => v.clienteId === clienteId
  );
}

export function onVentasActualizadas(listener) {
  listenersExternos.add(listener);
  return () => listenersExternos.delete(listener);
}

function notificarExternos() {
  for (const l of listenersExternos) {
    try {
      l();
    } catch (err) {
      console.error("Error en listener de ventas:", err);
    }
  }
}

export function getTotalPorCobrar() {
  let total = 0;
  for (const v of ventasEnMemoria.values()) {
    if (v.estadoPago !== "pagado") {
      total += (v.monto || 0) - (v.montoPagado || 0);
    }
  }
  return total;
}

export function getCantidadPendientes() {
  let n = 0;
  for (const v of ventasEnMemoria.values()) {
    if (v.estadoPago !== "pagado") n++;
  }
  return n;
}

export function getIngresosDelMes(year, month) {
  let total = 0;
  let efectivo = 0;
  let transferencia = 0;
  let cantidad = 0;
  const desglosePorTipo = {};
  for (const v of ventasEnMemoria.values()) {
    if (!v.fechaPago) continue;
    const [y, m] = v.fechaPago.split("-").map(Number);
    if (y !== year || m !== month) continue;
    const monto = v.montoPagado || 0;
    total += monto;
    cantidad++;
    if (v.metodoPago === "efectivo") efectivo += monto;
    else if (v.metodoPago === "transferencia") transferencia += monto;
    const tipo = v.tipo || "otro";
    desglosePorTipo[tipo] = (desglosePorTipo[tipo] || 0) + monto;
  }
  return { total, efectivo, transferencia, cantidad, desglosePorTipo };
}

export function getTopClientes(limite = 5) {
  const acumulado = new Map();
  for (const v of ventasEnMemoria.values()) {
    if (!v.clienteId) continue;
    acumulado.set(
      v.clienteId,
      (acumulado.get(v.clienteId) || 0) + (v.monto || 0)
    );
  }
  const arr = Array.from(acumulado.entries())
    .map(([clienteId, total]) => ({
      clienteId,
      total,
      cliente: clientesEnMemoria.get(clienteId)
    }))
    .filter((x) => x.cliente)
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
  return arr;
}

export function getCantidadVencidas(diasUmbral = 30) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let n = 0;
  for (const v of ventasEnMemoria.values()) {
    if (v.estadoPago === "pagado") continue;
    if (!v.fecha) continue;
    const [y, m, d] = v.fecha.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    const diff = Math.round((hoy - fecha) / (1000 * 60 * 60 * 24));
    if (diff >= diasUmbral) n++;
  }
  return n;
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribir();
  } else {
    if (unsubVentas) {
      unsubVentas();
      unsubVentas = null;
    }
    if (unsubClientes) {
      unsubClientes();
      unsubClientes = null;
    }
  }
});

function suscribir() {
  if (!unsubVentas) {
    const q = query(collection(db, "ventas"), orderBy("fecha", "desc"));
    unsubVentas = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      ventasEnMemoria = new Map(arr.map((v) => [v.id, v]));
      repintar();
      notificarExternos();
      if (ventaEnDetalleId && ventasEnMemoria.has(ventaEnDetalleId)) {
        pintarDetalle(ventasEnMemoria.get(ventaEnDetalleId));
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
  const valorActual = selectCliente.value;
  selectCliente.innerHTML =
    '<option value="">Selecciona un cliente...</option>' +
    clientes.map(() => '<option value=""></option>').join("");
  const opciones = selectCliente.querySelectorAll("option:not(:first-child)");
  clientes.forEach((c, i) => {
    if (opciones[i]) {
      opciones[i].value = c.id;
      opciones[i].textContent = c.nombre || "(sin nombre)";
    }
  });
  if (valorActual) selectCliente.value = valorActual;
}

function repintar() {
  if (!tieneListaTab) return;
  const todas = Array.from(ventasEnMemoria.values());
  const filtradas = aplicarFiltros(todas);
  actualizarContador(filtradas.length, todas.length);

  if (todas.length === 0) {
    lista.innerHTML =
      '<p class="mensaje-vacio">Aún no hay ventas. Agrega la primera con el botón de arriba.</p>';
    return;
  }
  if (filtradas.length === 0) {
    lista.innerHTML =
      '<p class="mensaje-vacio">No hay ventas con esos filtros.</p>';
    return;
  }
  lista.innerHTML = "";
  for (const v of filtradas) lista.appendChild(crearItem(v));
}

function aplicarFiltros(ventas) {
  if (!tieneListaTab) return ventas;
  const texto = (buscador.value || "").trim().toLowerCase();
  const estado = filtroEstado.value;
  const metodo = filtroMetodo.value;
  const factura = filtroFactura.value;
  return ventas.filter((v) => {
    if (estado && v.estadoPago !== estado) return false;
    if (metodo && v.metodoPago !== metodo) return false;
    if (factura === "si" && !v.requiereFactura) return false;
    if (factura === "no" && v.requiereFactura) return false;
    if (factura === "pendiente" && (!v.requiereFactura || v.facturaEmitida))
      return false;
    if (texto) {
      const cliente = clientesEnMemoria.get(v.clienteId);
      const blob = [
        cliente?.nombre || "",
        v.concepto || "",
        v.notas || "",
        TIPOS[v.tipo] || ""
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    return true;
  });
}

function actualizarContador(mostradas, total) {
  if (total === 0) {
    contador.textContent = "";
    return;
  }
  contador.textContent =
    mostradas === total ? `(${total})` : `(${mostradas} de ${total})`;
}

function crearItem(venta) {
  const cliente = clientesEnMemoria.get(venta.clienteId);
  const item = document.createElement("div");
  const estadoClase =
    venta.estadoPago === "pagado"
      ? "al-dia"
      : esVencida(venta)
        ? "vencido"
        : "proximo";
  item.className = `item-componente ${estadoClase}`;
  const tituloLinea = `${cliente?.nombre || "(cliente eliminado)"} — ${formatearMoneda(venta.monto)}`;
  const metaLinea = `${TIPOS[venta.tipo] || "Otro"} · ${formatearFechaCorta(venta.fecha)}${venta.metodoPago ? " · " + capitalizar(venta.metodoPago) : ""}`;
  const estadoLinea = textoEstado(venta);

  const mostrarWa = venta.estadoPago !== "pagado";
  item.innerHTML = `
    <div class="info-componente">
      <span class="nombre-componente"></span>
      <span class="meta-componente"></span>
      <span class="estado-componente"></span>
    </div>
    <div class="acciones-componente">
      ${mostrarWa ? '<button type="button" class="boton-mini wa" data-accion="wa">WhatsApp</button>' : ""}
      <button type="button" class="boton-mini" data-accion="ver">Detalle</button>
    </div>
  `;
  item.querySelector(".nombre-componente").textContent = tituloLinea;
  item.querySelector(".meta-componente").textContent = metaLinea;
  item.querySelector(".estado-componente").textContent = estadoLinea;
  item
    .querySelector('[data-accion="ver"]')
    .addEventListener("click", () => abrirDetalle(venta));
  const btnWa = item.querySelector('[data-accion="wa"]');
  if (btnWa) {
    btnWa.addEventListener("click", (e) => {
      e.stopPropagation();
      enviarRecordatorioCobro({ cliente, venta });
    });
  }
  item.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirDetalle(venta);
  });
  return item;
}

function esVencida(venta) {
  if (venta.estadoPago === "pagado") return false;
  if (!venta.fecha) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = venta.fecha.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const dias = Math.round((hoy - fecha) / (1000 * 60 * 60 * 24));
  return dias >= 30;
}

function textoEstado(venta) {
  if (venta.estadoPago === "pagado") return "Pagada";
  if (venta.estadoPago === "parcial")
    return `Pago parcial: faltan ${formatearMoneda((venta.monto || 0) - (venta.montoPagado || 0))}`;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (!venta.fecha) return "Pendiente de cobro";
  const [y, m, d] = venta.fecha.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const dias = Math.round((hoy - fecha) / (1000 * 60 * 60 * 24));
  if (dias < 0) return "Pendiente de cobro";
  if (dias === 0) return "Pendiente (vendido hoy)";
  if (dias >= 30) return `Pendiente desde hace ${dias} días`;
  return `Pendiente (${dias} día${dias === 1 ? "" : "s"})`;
}

function capitalizar(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatearMoneda(n) {
  const num = Number(n || 0);
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  });
}

function formatearFechaCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

if (tieneListaTab) {
  for (const el of [buscador, filtroEstado, filtroMetodo, filtroFactura]) {
    if (el) {
      el.addEventListener("input", repintar);
      el.addEventListener("change", repintar);
    }
  }
}

if (btnNueva) btnNueva.addEventListener("click", () => abrirFormulario("nuevo"));

export function abrirFormularioNuevaVenta(clienteId = null) {
  abrirFormulario("nuevo");
  if (clienteId) {
    setTimeout(() => { selectCliente.value = clienteId; }, 60);
  }
}

btnEditar.addEventListener("click", () => {
  if (!ventaEnDetalleId) return;
  const v = ventasEnMemoria.get(ventaEnDetalleId);
  if (!v) return;
  cerrarModal(modalDetalle);
  abrirFormulario("editar", v);
});

btnEliminar.addEventListener("click", async () => {
  if (!ventaEnDetalleId) return;
  const ok = window.confirm(
    "Eliminar esta venta? Esta accion no se puede deshacer."
  );
  if (!ok) return;
  try {
    btnEliminar.disabled = true;
    await deleteDoc(doc(db, "ventas", ventaEnDetalleId));
    cerrarModal(modalDetalle);
  } catch (error) {
    console.error("Error al eliminar venta:", error);
    window.alert("No se pudo eliminar.");
  } finally {
    btnEliminar.disabled = false;
  }
});

const modalCobrar = document.getElementById("modal-cobrar-venta");
const formCobrar = document.getElementById("form-cobrar");
const cobrarMetodo = document.getElementById("cobrar-metodo");
const cobrarMonto = document.getElementById("cobrar-monto");
const cobrarFecha = document.getElementById("cobrar-fecha");
const cobrarInfo = document.getElementById("cobrar-info");
const errorCobrar = document.getElementById("error-form-cobrar");
const btnConfirmarCobro = document.getElementById("btn-confirmar-cobro");

btnMarcarPagada.addEventListener("click", () => {
  if (!ventaEnDetalleId) return;
  const v = ventasEnMemoria.get(ventaEnDetalleId);
  if (!v) return;
  const cliente = clientesEnMemoria.get(v.clienteId);
  const restante = (v.monto || 0) - (v.montoPagado || 0);
  cobrarInfo.textContent = `Cliente: ${cliente?.nombre || "(cliente)"} — Total: ${formatearMoneda(v.monto)}${v.montoPagado ? " — Ya pagado: " + formatearMoneda(v.montoPagado) : ""}`;
  cobrarMetodo.value = v.metodoPago || "efectivo";
  cobrarMonto.value = restante.toFixed(2);
  cobrarFecha.value = hoyISO();
  errorCobrar.textContent = "";
  abrirModal(modalCobrar);
});

for (const el of modalCobrar.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => cerrarModal(modalCobrar));
}

formCobrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorCobrar.textContent = "";
  if (!ventaEnDetalleId) return;
  const v = ventasEnMemoria.get(ventaEnDetalleId);
  if (!v) return;

  const metodo = cobrarMetodo.value;
  const montoCobrado = parseFloat(cobrarMonto.value) || 0;
  const fecha = cobrarFecha.value || hoyISO();
  if (montoCobrado <= 0) {
    errorCobrar.textContent = "El monto cobrado debe ser mayor a 0.";
    return;
  }
  const yaPagado = v.montoPagado || 0;
  const totalPagado = yaPagado + montoCobrado;
  const total = v.monto || 0;
  if (totalPagado > total + 0.01) {
    errorCobrar.textContent = `Te estás cobrando ${formatearMoneda(totalPagado - total)} de más. Revisa el monto.`;
    return;
  }
  const nuevoEstado = totalPagado >= total - 0.01 ? "pagado" : "parcial";

  btnConfirmarCobro.disabled = true;
  const textoOriginal = btnConfirmarCobro.textContent;
  btnConfirmarCobro.textContent = "Guardando...";
  try {
    await updateDoc(doc(db, "ventas", ventaEnDetalleId), {
      estadoPago: nuevoEstado,
      montoPagado: totalPagado,
      metodoPago: metodo,
      fechaPago: fecha,
      fechaActualizacion: serverTimestamp()
    });
    cerrarModal(modalCobrar);
  } catch (error) {
    console.error("Error al registrar cobro:", error);
    errorCobrar.textContent = "No se pudo registrar el cobro. Intenta de nuevo.";
  } finally {
    btnConfirmarCobro.disabled = false;
    btnConfirmarCobro.textContent = textoOriginal;
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

function abrirModal(m) {
  m.classList.remove("oculto");
}
function cerrarModal(m) {
  m.classList.add("oculto");
}

function abrirFormulario(modo, venta = null) {
  form.dataset.modo = modo;
  form.dataset.id = venta?.id || "";
  errorForm.textContent = "";
  if (modo === "nuevo") {
    tituloForm.textContent = "Nueva venta";
    btnGuardar.textContent = "Guardar venta";
    form.reset();
    inputFecha.value = hoyISO();
    document.getElementById("venta-tipo").value = "insumo";
    document.getElementById("venta-estado").value = "pendiente";
  } else {
    tituloForm.textContent = "Editar venta";
    btnGuardar.textContent = "Guardar cambios";
    selectCliente.value = venta.clienteId || "";
    document.getElementById("venta-tipo").value = venta.tipo || "insumo";
    document.getElementById("venta-concepto").value = venta.concepto || "";
    inputFecha.value = venta.fecha || hoyISO();
    document.getElementById("venta-monto").value = venta.monto || "";
    document.getElementById("venta-estado").value =
      venta.estadoPago || "pendiente";
    document.getElementById("venta-metodo").value = venta.metodoPago || "";
    document.getElementById("venta-requiere-factura").checked =
      !!venta.requiereFactura;
    document.getElementById("venta-notas").value = venta.notas || "";
  }
  abrirModal(modalForm);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  const datos = leerFormulario();
  if (!datos.clienteId || !datos.concepto || !datos.monto) {
    errorForm.textContent = "Faltan datos obligatorios.";
    return;
  }
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";

  const modo = form.dataset.modo;
  const id = form.dataset.id;
  try {
    if (modo === "editar" && id) {
      await updateDoc(doc(db, "ventas", id), {
        ...datos,
        fechaActualizacion: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "ventas"), {
        ...datos,
        montoPagado: datos.estadoPago === "pagado" ? datos.monto : 0,
        fechaPago: datos.estadoPago === "pagado" ? hoyISO() : null,
        facturaEmitida: false,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp()
      });
    }
    cerrarModal(modalForm);
  } catch (error) {
    console.error("Error al guardar venta:", error);
    errorForm.textContent = "No se pudo guardar. Intenta de nuevo.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

function leerFormulario() {
  return {
    clienteId: selectCliente.value,
    tipo: document.getElementById("venta-tipo").value,
    concepto: document.getElementById("venta-concepto").value.trim(),
    fecha: inputFecha.value || hoyISO(),
    monto: parseFloat(document.getElementById("venta-monto").value) || 0,
    estadoPago: document.getElementById("venta-estado").value,
    metodoPago: document.getElementById("venta-metodo").value || null,
    requiereFactura: document.getElementById("venta-requiere-factura").checked,
    notas: document.getElementById("venta-notas").value.trim()
  };
}

export function abrirDetalleVentaPorId(id) {
  const v = ventasEnMemoria.get(id);
  if (v) abrirDetalle(v);
}

function abrirDetalle(venta) {
  ventaEnDetalleId = venta.id;
  abrirModal(modalDetalle);
  pintarDetalle(venta);
}

function pintarDetalle(venta) {
  const cliente = clientesEnMemoria.get(venta.clienteId);
  tituloDetalle.textContent = `${cliente?.nombre || "(cliente)"} — ${formatearMoneda(venta.monto)}`;
  const filas = [
    ["Cliente", cliente?.nombre || "(cliente eliminado)"],
    ["Tipo", TIPOS[venta.tipo] || "Otro"],
    ["Concepto", venta.concepto || "—"],
    ["Fecha", formatearFechaCorta(venta.fecha)],
    ["Monto", formatearMoneda(venta.monto)],
    [
      "Estado de pago",
      venta.estadoPago === "pagado"
        ? `Pagada (${formatearFechaCorta(venta.fechaPago) || ""})`
        : venta.estadoPago === "parcial"
          ? `Parcial: ${formatearMoneda(venta.montoPagado)} de ${formatearMoneda(venta.monto)}`
          : "Pendiente"
    ],
    ["Método de pago", venta.metodoPago ? capitalizar(venta.metodoPago) : "—"],
    [
      "Factura",
      venta.requiereFactura
        ? venta.facturaEmitida
          ? "Pidió y ya se emitió"
          : "Pidió, FALTA EMITIR"
        : "No pidió"
    ],
    ["Notas", venta.notas || "—"]
  ];
  contenidoDetalle.innerHTML = filas
    .map(
      ([etiqueta]) => `
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
  btnMarcarPagada.style.display =
    venta.estadoPago === "pagado" ? "none" : "";
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
