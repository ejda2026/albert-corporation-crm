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

btnVerTodos.addEventListener("click", () => {
  const btnTab = document.querySelector('[data-seccion="mantenimientos"]');
  if (btnTab) btnTab.click();
});

repintarDashboard();

function repintarDashboard() {
  pintarResumenClientes();
  pintarResumenEquipos();
  pintarResumenMantenimientos();
  pintarListaUrgentes();
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
  return item;
}
