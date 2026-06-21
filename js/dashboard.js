import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";
import {
  getTodosLosEquipos,
  getClienteDelEquipo,
  getEtiquetaTipo,
  onEquiposActualizados,
  abrirDetalleEquipoPorId
} from "./equipos.js";
import {
  COMPONENTES,
  calcularProximoMantenimiento,
  estadoDeMantenimiento,
  formatearFechaCorta,
  marcarMantenimientoRealizado
} from "./componentes.js";
import {
  getTotalPorCobrar,
  getCantidadVencidas,
  getCantidadPendientes,
  getIngresosDelMes,
  getTopClientes,
  onVentasActualizadas
} from "./ventas.js";
import { enviarRecordatorioMantenimiento } from "./whatsapp.js";

const elMantVencidos = document.getElementById("dash-mant-vencidos");
const elMantProximos = document.getElementById("dash-mant-proximos");
const elMantMes = document.getElementById("dash-mant-mes");
const elClientesTotal = document.getElementById("dash-clientes-total");
const elClientesResidenciales = document.getElementById(
  "dash-clientes-residenciales"
);
const elClientesComerciales = document.getElementById(
  "dash-clientes-comerciales"
);
const elEquiposTotal = document.getElementById("dash-equipos-total");
const elEquiposPlantas = document.getElementById("dash-equipos-plantas");
const elEquiposDomesticos = document.getElementById("dash-equipos-domesticos");
const elEquiposAlbercas = document.getElementById("dash-equipos-albercas");
const elListaUrgentes = document.getElementById("dash-lista-urgentes");
const btnVerTodos = document.getElementById("dash-ver-todos");
const elPorCobrar = document.getElementById("dash-por-cobrar");
const elPorCobrarVencidas = document.getElementById("dash-por-cobrar-vencidas");
const elPorCobrarCantidad = document.getElementById(
  "dash-por-cobrar-cantidad"
);

let clientesDelDash = new Map();
let unsubClientesDash = null;

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribirClientesDash();
  } else if (unsubClientesDash) {
    unsubClientesDash();
    unsubClientesDash = null;
  }
});

function suscribirClientesDash() {
  if (unsubClientesDash) return;
  const q = query(collection(db, "clientes"), orderBy("nombre"));
  unsubClientesDash = onSnapshot(q, (snap) => {
    clientesDelDash = new Map(
      snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])
    );
    repintarDashboard();
  });
}

onEquiposActualizados(() => repintarDashboard());
onVentasActualizadas(() => repintarDashboard());

if (btnVerTodos) btnVerTodos.addEventListener("click", () => {
  const btnTab = document.querySelector('[data-seccion="mantenimientos"]');
  if (btnTab) btnTab.click();
});

repintarDashboard();

function repintarDashboard() {
  pintarResumenClientes();
  pintarResumenEquipos();
  pintarResumenMantenimientos();
  pintarResumenCobranza();
  pintarListaUrgentes();
  pintarSaludFinanciera();
}

const TIPO_VENTA_LABELS = {
  insumo: "Insumos",
  servicio: "Servicios",
  "venta-equipo": "Venta de equipos",
  otro: "Otro"
};

function pintarSaludFinanciera() {
  const ahora = new Date();
  const yActual = ahora.getFullYear();
  const mActual = ahora.getMonth() + 1;
  const fechaAnterior = new Date(yActual, mActual - 2, 1);
  const yPasado = fechaAnterior.getFullYear();
  const mPasado = fechaAnterior.getMonth() + 1;

  const actual = getIngresosDelMes(yActual, mActual);
  const pasado = getIngresosDelMes(yPasado, mPasado);

  document.getElementById("dash-mes-actual").textContent =
    `(${capitalizarMes(ahora)})`;
  document.getElementById("dash-ingresos-mes").textContent = moneda(actual.total);
  document.getElementById("dash-ingresos-efectivo").textContent = moneda(actual.efectivo);
  document.getElementById("dash-ingresos-transferencia").textContent = moneda(actual.transferencia);
  document.getElementById("dash-ingresos-cantidad").textContent = actual.cantidad;

  const comp = document.getElementById("dash-ingresos-comparativo");
  if (pasado.total === 0) {
    comp.textContent = "Sin datos del mes anterior para comparar";
    comp.className = "card-etiqueta";
  } else {
    const dif = actual.total - pasado.total;
    const pct = Math.round((dif / pasado.total) * 100);
    const signo = pct >= 0 ? "+" : "";
    comp.textContent = `vs ${moneda(pasado.total)} el mes anterior (${signo}${pct}%)`;
    comp.className =
      pct >= 0
        ? "card-etiqueta comparativo-positivo"
        : "card-etiqueta comparativo-negativo";
  }

  const ulTipos = document.getElementById("dash-por-tipo");
  const tipos = Object.entries(actual.desglosePorTipo).sort(
    (a, b) => b[1] - a[1]
  );
  if (tipos.length === 0) {
    ulTipos.innerHTML =
      '<li class="mensaje-vacio-pequeño">Sin ventas en este mes.</li>';
  } else {
    ulTipos.innerHTML = tipos
      .map(
        ([tipo, monto]) => `
          <li>
            <span class="nombre">${TIPO_VENTA_LABELS[tipo] || tipo}</span>
            <span class="valor">${moneda(monto)}</span>
          </li>
        `
      )
      .join("");
  }

  const ulTop = document.getElementById("dash-top-clientes");
  const top = getTopClientes(5);
  if (top.length === 0) {
    ulTop.innerHTML =
      '<li class="mensaje-vacio-pequeño">Aún no hay ventas suficientes.</li>';
  } else {
    ulTop.innerHTML = top
      .map(
        ({ cliente, total }) => `
          <li>
            <span class="nombre"></span>
            <span class="valor">${moneda(total)}</span>
          </li>
        `
      )
      .join("");
    const nombres = ulTop.querySelectorAll(".nombre");
    top.forEach(({ cliente }, i) => {
      if (nombres[i]) nombres[i].textContent = cliente.nombre || "(sin nombre)";
    });
  }
}

function moneda(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  });
}

function capitalizarMes(d) {
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function pintarResumenCobranza() {
  const total = getTotalPorCobrar();
  elPorCobrar.textContent = total.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  });
  elPorCobrarVencidas.textContent = getCantidadVencidas(30);
  elPorCobrarCantidad.textContent = getCantidadPendientes();
}

function pintarResumenClientes() {
  const clientes = Array.from(clientesDelDash.values());
  const total = clientes.length;
  const res = clientes.filter((c) => c.tipo !== "comercial").length;
  const com = clientes.filter((c) => c.tipo === "comercial").length;
  elClientesTotal.textContent = total;
  elClientesResidenciales.textContent = res;
  elClientesComerciales.textContent = com;
}

function pintarResumenEquipos() {
  const equipos = getTodosLosEquipos();
  elEquiposTotal.textContent = equipos.length;
  elEquiposPlantas.textContent = equipos.filter(
    (e) => e.tipo === "planta-purificadora"
  ).length;
  elEquiposDomesticos.textContent = equipos.filter(
    (e) => e.tipo === "equipo-domestico"
  ).length;
  elEquiposAlbercas.textContent = equipos.filter(
    (e) => e.tipo === "alberca-equipo"
  ).length;
}

function construirItems() {
  const equipos = getTodosLosEquipos();
  const items = [];
  for (const equipo of equipos) {
    const comps = Array.isArray(equipo.componentes) ? equipo.componentes : [];
    comps.forEach((comp, indice) => {
      const proxima = calcularProximoMantenimiento(comp, equipo);
      const estado = estadoDeMantenimiento(proxima);
      const cliente = getClienteDelEquipo(equipo.clienteId);
      items.push({ equipo, componente: comp, indice, proxima, estado, cliente });
    });
  }
  items.sort((a, b) => {
    const ordenEstado = { vencido: 0, proximo: 1, "al-dia": 2 };
    const ea = ordenEstado[a.estado.tipo];
    const eb = ordenEstado[b.estado.tipo];
    if (ea !== eb) return ea - eb;
    return a.proxima.localeCompare(b.proxima);
  });
  return items;
}

function pintarResumenMantenimientos() {
  const items = construirItems();
  const vencidos = items.filter((i) => i.estado.tipo === "vencido").length;
  const proximos = items.filter((i) => i.estado.tipo === "proximo").length;
  const finMes = new Date();
  finMes.setHours(0, 0, 0, 0);
  finMes.setDate(finMes.getDate() + 30);
  const esteMes = items.filter((i) => {
    const [y, m, d] = i.proxima.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha <= finMes;
  }).length;
  elMantVencidos.textContent = vencidos;
  elMantProximos.textContent = proximos;
  elMantMes.textContent = esteMes;
}

function pintarListaUrgentes() {
  if (!elListaUrgentes) return;
  const items = construirItems().slice(0, 5);
  if (items.length === 0) {
    elListaUrgentes.innerHTML =
      '<p class="mensaje-vacio">No hay mantenimientos registrados todavía.</p>';
    return;
  }
  elListaUrgentes.innerHTML = "";
  for (const it of items) {
    elListaUrgentes.appendChild(crearItemUrgente(it));
  }
}

function crearItemUrgente({ equipo, componente, indice, proxima, estado, cliente }) {
  const item = document.createElement("div");
  item.className = `item-componente ${estado.tipo}`;
  const etiquetaComp =
    COMPONENTES[componente.tipo]?.etiqueta || componente.tipo;
  let textoEstado;
  if (estado.tipo === "vencido") {
    textoEstado = `Vencido hace ${estado.dias} día${estado.dias === 1 ? "" : "s"} (${formatearFechaCorta(proxima)})`;
  } else if (estado.tipo === "proximo") {
    textoEstado = estado.dias === 0
      ? `Toca hoy (${formatearFechaCorta(proxima)})`
      : `En ${estado.dias} día${estado.dias === 1 ? "" : "s"} (${formatearFechaCorta(proxima)})`;
  } else {
    textoEstado = `Faltan ${estado.dias} días (${formatearFechaCorta(proxima)})`;
  }
  item.innerHTML = `
    <div class="info-componente">
      <span class="nombre-componente"></span>
      <span class="meta-componente"></span>
      <span class="estado-componente"></span>
    </div>
    <div class="acciones-componente">
      <button type="button" class="boton-mini principal" data-accion="marcar">Marcar realizado</button>
      <button type="button" class="boton-mini wa" data-accion="wa">WhatsApp</button>
      <button type="button" class="boton-mini" data-accion="ver">Ver equipo</button>
    </div>
  `;
  item.querySelector(".nombre-componente").textContent =
    `${cliente?.nombre || "(cliente eliminado)"} — ${etiquetaComp}`;
  item.querySelector(".meta-componente").textContent =
    `${getEtiquetaTipo(equipo.tipo)}${equipo.modelo ? " · " + equipo.modelo : ""}${cliente?.ciudad ? " · " + cliente.ciudad : ""}`;
  item.querySelector(".estado-componente").textContent = textoEstado;

  item
    .querySelector('[data-accion="marcar"]')
    .addEventListener("click", async () => {
      try {
        await marcarMantenimientoRealizado(equipo, indice);
      } catch (err) {
        console.error("Error al marcar mantenimiento:", err);
        window.alert("No se pudo marcar el mantenimiento.");
      }
    });
  item.querySelector('[data-accion="ver"]').addEventListener("click", () => {
    abrirDetalleEquipoPorId(equipo.id);
  });
  const btnWa = item.querySelector('[data-accion="wa"]');
  if (btnWa) {
    btnWa.addEventListener("click", () => {
      enviarRecordatorioMantenimiento({
        cliente,
        equipo,
        componente,
        fechaProxima: proxima,
        estadoTipo: estado.tipo
      });
    });
  }
  return item;
}
