import { COMPONENTES, formatearFechaCorta } from "./componentes.js";
import { getEtiquetaTipo } from "./equipos.js";

const NOMBRE_NEGOCIO = "Albert Corporation";

export function enviarRecordatorioMantenimiento({
  cliente,
  equipo,
  componente,
  fechaProxima,
  estadoTipo
}) {
  if (!cliente?.telefono) {
    window.alert(
      "Este cliente no tiene teléfono registrado. Edítalo y agrega uno para poder enviar el mensaje."
    );
    return;
  }
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "";
  const saludo = nombreCorto ? `Hola ${nombreCorto},` : "Hola,";
  const etiquetaComp =
    COMPONENTES[componente.tipo]?.etiqueta || componente.tipo || "su equipo";
  const tipoEquipo = getEtiquetaTipo(equipo.tipo).toLowerCase();
  const fechaTexto = formatearFechaCorta(fechaProxima);

  let cuerpo;
  if (estadoTipo === "vencido") {
    cuerpo = `le escribimos de ${NOMBRE_NEGOCIO}. Detectamos que el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} estaba programado para el ${fechaTexto} y aún no se ha realizado. ¿Podemos agendarle una visita esta semana?`;
  } else if (estadoTipo === "proximo") {
    cuerpo = `le escribimos de ${NOMBRE_NEGOCIO}. Le recordamos que el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} está programado para el ${fechaTexto}. ¿Le viene bien que lo agendemos?`;
  } else {
    cuerpo = `le escribimos de ${NOMBRE_NEGOCIO}. Próximamente toca el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} (programado para el ${fechaTexto}). Queríamos avisarle con tiempo.`;
  }

  const mensaje = `${saludo} ${cuerpo}\n\nQuedamos atentos. Gracias.`;
  abrirWhatsApp(cliente.telefono, mensaje);
}

export function enviarRecordatorioCobro({ cliente, venta }) {
  if (!cliente?.telefono) {
    window.alert(
      "Este cliente no tiene teléfono registrado. Edítalo y agrega uno para poder enviar el mensaje."
    );
    return;
  }
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "";
  const saludo = nombreCorto ? `Hola ${nombreCorto},` : "Hola,";
  const restante = (venta.monto || 0) - (venta.montoPagado || 0);
  const montoTxt = restante.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  });
  const concepto = venta.concepto ? `por "${venta.concepto}"` : "";
  const fechaTxt = venta.fecha ? `del ${formatearFechaCorta(venta.fecha)}` : "";

  const cuerpo = `le escribimos de ${NOMBRE_NEGOCIO}. Le recordamos que tiene pendiente el pago de ${montoTxt} ${concepto} ${fechaTxt}. ¿Podría confirmarnos cuándo podemos pasar a cobrar o si prefiere transferencia?`;
  const mensaje = `${saludo} ${cuerpo}\n\nGracias por su atención.`;
  abrirWhatsApp(cliente.telefono, mensaje);
}

function abrirWhatsApp(telefono, mensaje) {
  const numero = normalizarTelefono(telefono);
  if (!numero) {
    window.alert(
      `El teléfono "${telefono}" no se reconoce. Debe ser un número de 10 dígitos.`
    );
    return;
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
}

function normalizarTelefono(tel) {
  if (!tel) return null;
  const limpio = String(tel).replace(/\D/g, "");
  if (limpio.length === 10) return "52" + limpio;
  if (limpio.length === 12 && limpio.startsWith("52")) return limpio;
  if (limpio.length === 13 && limpio.startsWith("521")) return limpio;
  return null;
}
