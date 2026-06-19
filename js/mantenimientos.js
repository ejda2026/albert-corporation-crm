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
import { enviarRecordatorioMantenimiento } from "./whatsapp.js";

const lista = document.getElementById("lista-mantenimientos");
const buscador = document.getElementById("buscador-mantenimientos");
const filtroEstado = document.getElementById("filtro-mant-estado");
const filtroCiudad = document.getElementById("filtro-mant-ciudad");
const filtroComponente = document.getElementById("filtro-mant-componente");
const contador = document.getElementById("contador-mantenimientos");

onEquiposActualizados(() => repintar());

for (const el of [buscador, filtroEstado, filtroCiudad, filtroComponente]) {
  el.addEventListener("input", repintar);
  el.addEventListener("change", repintar);
}

repintar();

function repintar() {
  const items = construirItems();
  const filtrados = aplicarFiltros(items);
  actualizarContador(filtrados.length, items.length);

  if (items.length === 0) {
    lista.innerHTML =
      '<p class="mensaje-vacio">Aún no hay mantenimientos programados. Agrega componentes en los equipos de tus clientes.</p>';
    return;
  }
  if (filtrados.length === 0) {
    lista.innerHTML =
      '<p class="mensaje-vacio">No hay mantenimientos con esos filtros.</p>';
    return;
  }
  lista.innerHTML = "";
  for (const item of filtrados) {
    lista.appendChild(crearItem(item));
  }
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
      items.push({
        equipo,
        componente: comp,
        indice,
        proxima,
        estado,
        cliente
      });
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

function aplicarFiltros(items) {
  const texto = (buscador.value || "").trim().toLowerCase();
  const estado = filtroEstado.value;
  const ciudad = filtroCiudad.value;
  const componenteTipo = filtroComponente.value;
  return items.filter((it) => {
    if (estado && it.estado.tipo !== estado) return false;
    if (ciudad && (it.cliente?.ciudad || "") !== ciudad) return false;
    if (componenteTipo && it.componente.tipo !== componenteTipo) return false;
    if (texto) {
      const etiquetaComp =
        COMPONENTES[it.componente.tipo]?.etiqueta || "";
      const blob = [
        it.cliente?.nombre || "",
        it.equipo.modelo || "",
        getEtiquetaTipo(it.equipo.tipo),
        etiquetaComp,
        it.componente.notas || ""
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
    contador.textContent = "";
    return;
  }
  contador.textContent =
    mostrados === total ? `(${total})` : `(${mostrados} de ${total})`;
}

function crearItem({ equipo, componente, indice, proxima, estado, cliente }) {
  const item = document.createElement("div");
  item.className = `item-componente ${estado.tipo}`;
  const etiquetaComp =
    COMPONENTES[componente.tipo]?.etiqueta || componente.tipo;
  const tipoEquipo = getEtiquetaTipo(equipo.tipo);
  const ciudad = cliente?.ciudad ? ` · ${cliente.ciudad}` : "";

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
    `${tipoEquipo}${equipo.modelo ? " · " + equipo.modelo : ""}${ciudad}`;
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
