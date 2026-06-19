import { COMPONENTES, formatearFechaCorta } from "./componentes.js";
import { getEtiquetaTipo } from "./equipos.js";
import { getConfiguracion } from "./configuracion.js";

const NOMBRE_NEGOCIO_DEFAULT = "Albert Corporation";

function aplicarPlantilla(plantilla, valores) {
  let texto = plantilla;
  for (const [clave, valor] of Object.entries(valores)) {
    texto = texto.replaceAll(`{${clave}}`, valor || "");
  }
  return texto;
}

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
  const config = getConfiguracion();
  const negocio = config.nombreNegocio || NOMBRE_NEGOCIO_DEFAULT;
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "";
  const etiquetaComp =
    COMPONENTES[componente.tipo]?.etiqueta || componente.tipo || "su equipo";
  const tipoEquipo = getEtiquetaTipo(equipo.tipo).toLowerCase();
  const fechaTexto = formatearFechaCorta(fechaProxima);
  const valores = {
    cliente: nombreCorto || cliente.nombre || "",
    negocio,
    componente: etiquetaComp,
    equipo: tipoEquipo,
    fecha: fechaTexto
  };

  let plantilla;
  if (estadoTipo === "vencido") {
    plantilla = config.plantillaVencido;
  } else if (estadoTipo === "proximo") {
    plantilla = config.plantillaProximo;
  } else {
    plantilla = config.plantillaAldia;
  }

  let mensaje;
  if (plantilla) {
    mensaje = aplicarPlantilla(plantilla, valores);
  } else {
    const saludo = nombreCorto ? `Hola ${nombreCorto},` : "Hola,";
    let cuerpo;
    if (estadoTipo === "vencido") {
      cuerpo = `le escribimos de ${negocio}. Detectamos que el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} estaba programado para el ${fechaTexto} y aún no se ha realizado. ¿Podemos agendarle una visita esta semana?`;
    } else if (estadoTipo === "proximo") {
      cuerpo = `le escribimos de ${negocio}. Le recordamos que el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} está programado para el ${fechaTexto}. ¿Le viene bien que lo agendemos?`;
    } else {
      cuerpo = `le escribimos de ${negocio}. Próximamente toca el mantenimiento de ${etiquetaComp} de su ${tipoEquipo} (programado para el ${fechaTexto}). Queríamos avisarle con tiempo.`;
    }
    mensaje = `${saludo} ${cuerpo}\n\nQuedamos atentos. Gracias.`;
  }

  abrirWhatsApp(cliente.telefono, mensaje);
}

export function enviarRecordatorioCobro({ cliente, venta }) {
  if (!cliente?.telefono) {
    window.alert(
      "Este cliente no tiene teléfono registrado. Edítalo y agrega uno para poder enviar el mensaje."
    );
    return;
  }
  const config = getConfiguracion();
  const negocio = config.nombreNegocio || NOMBRE_NEGOCIO_DEFAULT;
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "";
  const restante = (venta.monto || 0) - (venta.montoPagado || 0);
  const montoTxt = restante.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  });
  const fechaTxt = venta.fecha ? formatearFechaCorta(venta.fecha) : "";

  let mensaje;
  if (config.plantillaCobro) {
    mensaje = aplicarPlantilla(config.plantillaCobro, {
      cliente: nombreCorto || cliente.nombre || "",
      negocio,
      monto: montoTxt,
      concepto: venta.concepto || "",
      fecha: fechaTxt
    });
  } else {
    const saludo = nombreCorto ? `Hola ${nombreCorto},` : "Hola,";
    const concepto = venta.concepto ? `por "${venta.concepto}"` : "";
    const fechaParte = fechaTxt ? `del ${fechaTxt}` : "";
    const cuerpo = `le escribimos de ${negocio}. Le recordamos que tiene pendiente el pago de ${montoTxt} ${concepto} ${fechaParte}. ¿Podría confirmarnos cuándo podemos pasar a cobrar o si prefiere transferencia?`;
    mensaje = `${saludo} ${cuerpo}\n\nGracias por su atención.`;
  }

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
