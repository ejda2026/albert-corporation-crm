import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";

const CATEGORIAS = {
  insumo: "Insumo",
  equipo: "Equipo",
  servicio: "Servicio"
};

const lista = document.getElementById("lista-catalogo");
const btnNuevo = document.getElementById("btn-nuevo-producto");
const modalForm = document.getElementById("modal-form-producto");
const form = document.getElementById("form-producto");
const tituloForm = document.getElementById("titulo-modal-form-producto");
const btnGuardar = document.getElementById("btn-guardar-producto");
const errorForm = document.getElementById("error-form-producto");
const inputNombre = document.getElementById("prod-nombre");
const selectCategoria = document.getElementById("prod-categoria");
const inputPrecio = document.getElementById("prod-precio");
const inputCosto = document.getElementById("prod-costo");
const inputUnidad = document.getElementById("prod-unidad");
const inputDescripcion = document.getElementById("prod-descripcion");
const buscador = document.getElementById("buscador-catalogo");
const filtroCategoria = document.getElementById("filtro-cat-categoria");
const contador = document.getElementById("contador-catalogo");

let productosEnMemoria = new Map();
let unsubProductos = null;
let seedIntentado = false;

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribir();
  } else if (unsubProductos) {
    unsubProductos();
    unsubProductos = null;
  }
});

function suscribir() {
  if (unsubProductos) return;
  const q = query(collection(db, "productos"), orderBy("nombre"));
  unsubProductos = onSnapshot(q, async (snap) => {
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    productosEnMemoria = new Map(arr.map((p) => [p.id, p]));
    repintar();
    if (!seedIntentado && arr.length === 0) {
      seedIntentado = true;
      await sembrarSalSiCorresponde();
    }
  });
}

async function sembrarSalSiCorresponde() {
  try {
    const snap = await getDocs(query(collection(db, "productos")));
    if (!snap.empty) return;
    await addDoc(collection(db, "productos"), {
      nombre: "Saco de sal en pellets",
      categoria: "insumo",
      precio: 220,
      costo: 0,
      unidad: "saco",
      descripcion: "Sal en pellets para tanque de salmuera del suavizador.",
      activo: true,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
  } catch (err) {
    console.warn("No se pudo sembrar producto inicial:", err);
  }
}

function repintar() {
  const todos = Array.from(productosEnMemoria.values());
  const filtrados = aplicarFiltros(todos);
  if (todos.length === 0) {
    contador.textContent = "";
    lista.innerHTML = '<p class="mensaje-vacio">Aún no hay productos en el catálogo. Agrega el primero con el botón de arriba.</p>';
    return;
  }
  contador.textContent = filtrados.length === todos.length ? `(${todos.length})` : `(${filtrados.length} de ${todos.length})`;
  if (filtrados.length === 0) {
    lista.innerHTML = '<p class="mensaje-vacio">No hay productos con esos filtros.</p>';
    return;
  }
  lista.innerHTML = "";
  for (const p of filtrados) lista.appendChild(crearItem(p));
}

function aplicarFiltros(arr) {
  const t = (buscador.value || "").trim().toLowerCase();
  const cat = filtroCategoria.value;
  return arr.filter((p) => {
    if (cat && p.categoria !== cat) return false;
    if (t) {
      const blob = [p.nombre || "", p.descripcion || "", p.unidad || ""].join(" ").toLowerCase();
      if (!blob.includes(t)) return false;
    }
    return true;
  });
}

function crearItem(p) {
  const item = document.createElement("div");
  item.className = "item-componente";
  item.innerHTML = `
    <div class="info-componente">
      <span class="nombre-componente"></span>
      <span class="meta-componente"></span>
      <span class="estado-componente"></span>
    </div>
    <div class="acciones-componente">
      <span class="etiqueta-tipo ${p.categoria === "equipo" ? "comercial" : p.categoria === "servicio" ? "residencial" : "comercial"}"></span>
      <button type="button" class="boton-mini" data-accion="editar">Editar</button>
      <button type="button" class="boton-mini peligro" data-accion="eliminar">Eliminar</button>
    </div>
  `;
  item.querySelector(".nombre-componente").textContent = p.nombre || "(sin nombre)";
  const partes = [moneda(p.precio)];
  if (p.unidad) partes.push(`por ${p.unidad}`);
  if (p.costo) {
    const margen = p.precio - p.costo;
    const pct = p.precio > 0 ? Math.round((margen / p.precio) * 100) : 0;
    partes.push(`margen ${moneda(margen)} (${pct}%)`);
  }
  item.querySelector(".meta-componente").textContent = partes.join(" · ");
  item.querySelector(".estado-componente").textContent = p.descripcion || "";
  item.querySelector(".etiqueta-tipo").textContent = CATEGORIAS[p.categoria] || "Otro";
  item.querySelector('[data-accion="editar"]').addEventListener("click", () => abrirFormulario("editar", p));
  item.querySelector('[data-accion="eliminar"]').addEventListener("click", async () => {
    if (!window.confirm(`Eliminar "${p.nombre}" del catálogo?`)) return;
    try {
      await deleteDoc(doc(db, "productos", p.id));
    } catch (err) {
      console.error(err);
      window.alert("No se pudo eliminar.");
    }
  });
  return item;
}

for (const el of [buscador, filtroCategoria]) {
  el.addEventListener("input", repintar);
  el.addEventListener("change", repintar);
}

btnNuevo.addEventListener("click", () => abrirFormulario("nuevo"));

for (const el of modalForm.querySelectorAll("[data-cerrar]")) {
  el.addEventListener("click", () => modalForm.classList.add("oculto"));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalForm.classList.contains("oculto")) {
    modalForm.classList.add("oculto");
  }
});

function abrirFormulario(modo, p = null) {
  form.dataset.modo = modo;
  form.dataset.id = p?.id || "";
  errorForm.textContent = "";
  if (modo === "nuevo") {
    tituloForm.textContent = "Nuevo producto / servicio";
    btnGuardar.textContent = "Guardar";
    form.reset();
    selectCategoria.value = "insumo";
  } else {
    tituloForm.textContent = "Editar producto";
    btnGuardar.textContent = "Guardar cambios";
    inputNombre.value = p.nombre || "";
    selectCategoria.value = p.categoria || "insumo";
    inputPrecio.value = p.precio || "";
    inputCosto.value = p.costo || "";
    inputUnidad.value = p.unidad || "";
    inputDescripcion.value = p.descripcion || "";
  }
  modalForm.classList.remove("oculto");
  setTimeout(() => inputNombre.focus(), 60);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorForm.textContent = "";
  const datos = {
    nombre: inputNombre.value.trim(),
    categoria: selectCategoria.value,
    precio: parseFloat(inputPrecio.value) || 0,
    costo: parseFloat(inputCosto.value) || 0,
    unidad: inputUnidad.value.trim(),
    descripcion: inputDescripcion.value.trim(),
    activo: true,
    fechaActualizacion: serverTimestamp()
  };
  if (!datos.nombre || !datos.precio) {
    errorForm.textContent = "Faltan datos obligatorios.";
    return;
  }
  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando...";
  try {
    const modo = form.dataset.modo;
    const id = form.dataset.id;
    if (modo === "editar" && id) {
      await updateDoc(doc(db, "productos", id), datos);
    } else {
      await addDoc(collection(db, "productos"), {
        ...datos,
        fechaCreacion: serverTimestamp()
      });
    }
    modalForm.classList.add("oculto");
  } catch (err) {
    console.error("Error al guardar producto:", err);
    errorForm.textContent = "No se pudo guardar.";
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
});

function moneda(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

export function getProductos() {
  return Array.from(productosEnMemoria.values());
}
