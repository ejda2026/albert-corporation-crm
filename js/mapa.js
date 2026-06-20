import {
  collection,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, db } from "./config.js";

const CIUDADES = {
  Navojoa: { lat: 27.0742, lng: -109.4437 },
  Huatabampo: { lat: 26.8265, lng: -109.6402 },
  Etchojoa: { lat: 26.9111, lng: -109.6306 },
  Hermosillo: { lat: 29.0729, lng: -110.9559 }
};

const togglesVista = document.querySelectorAll(".toggle-btn[data-vista]");
const listaContenedor = document.getElementById("lista-clientes");
const mapaContenedor = document.getElementById("mapa-clientes-contenedor");
const mapaDiv = document.getElementById("mapa-clientes");
const barraFiltros = document.querySelector("#seccion-clientes .barra-filtros");

let mapa = null;
let markers = [];
let unsubscribeMapa = null;
let clientesParaMapa = [];

for (const t of togglesVista) {
  t.addEventListener("click", () => {
    const vista = t.dataset.vista;
    for (const otro of togglesVista) {
      otro.classList.toggle("activa", otro === t);
    }
    if (vista === "lista") {
      listaContenedor.classList.remove("oculto");
      if (barraFiltros) barraFiltros.classList.remove("oculto");
      mapaContenedor.classList.add("oculto");
    } else {
      listaContenedor.classList.add("oculto");
      if (barraFiltros) barraFiltros.classList.add("oculto");
      mapaContenedor.classList.remove("oculto");
      inicializarMapaSiHaceFalta();
      pintarMarkers();
      setTimeout(() => mapa?.invalidateSize(), 100);
    }
  });
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    suscribirClientes();
  } else if (unsubscribeMapa) {
    unsubscribeMapa();
    unsubscribeMapa = null;
  }
});

function suscribirClientes() {
  if (unsubscribeMapa) return;
  const q = query(collection(db, "clientes"), orderBy("nombre"));
  unsubscribeMapa = onSnapshot(q, (snap) => {
    clientesParaMapa = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (mapa && !mapaContenedor.classList.contains("oculto")) {
      pintarMarkers();
    }
  });
}

function inicializarMapaSiHaceFalta() {
  if (mapa) return;
  if (typeof window.L === "undefined") {
    mapaDiv.innerHTML = '<p style="padding:20px; text-align:center; color:var(--color-texto-2);">Cargando librería del mapa...</p>';
    setTimeout(inicializarMapaSiHaceFalta, 300);
    return;
  }
  mapa = window.L.map(mapaDiv).setView([27.0742, -109.4437], 9);
  window.L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  ).addTo(mapa);
}

function pintarMarkers() {
  if (!mapa) return;
  for (const m of markers) mapa.removeLayer(m);
  markers = [];

  const agrupados = new Map();
  for (const c of clientesParaMapa) {
    const ciudad = c.ciudad || "Otro";
    if (!agrupados.has(ciudad)) agrupados.set(ciudad, []);
    agrupados.get(ciudad).push(c);
  }

  for (const [ciudad, clientes] of agrupados.entries()) {
    const coords = CIUDADES[ciudad];
    if (!coords) continue;
    const icono = window.L.divIcon({
      className: "marker-ciudad",
      html: `<div style="background:#1f4e9c; color:white; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.25);">${clientes.length}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    const marker = window.L.marker([coords.lat, coords.lng], { icon: icono }).addTo(mapa);
    const items = clientes
      .map((c) => `<li data-id="${c.id}">${escapar(c.nombre || "(sin nombre)")}</li>`)
      .join("");
    const popup = `
      <div class="popup-clientes-ciudad">
        <h3>${escapar(ciudad)} <span class="contador-mini">${clientes.length}</span></h3>
        <ul>${items}</ul>
      </div>
    `;
    marker.bindPopup(popup, { maxWidth: 260 });
    marker.on("popupopen", () => {
      const popupEl = document.querySelector(".popup-clientes-ciudad");
      if (!popupEl) return;
      for (const li of popupEl.querySelectorAll("li")) {
        li.addEventListener("click", () => {
          const id = li.dataset.id;
          window.dispatchEvent(new CustomEvent("abrir-cliente-desde-mapa", { detail: { id } }));
          marker.closePopup();
        });
      }
    });
    markers.push(marker);
  }

  if (markers.length > 0) {
    const grupo = window.L.featureGroup(markers);
    mapa.fitBounds(grupo.getBounds().pad(0.3));
  }
}

function escapar(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
