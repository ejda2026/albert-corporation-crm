const botonesNav = document.querySelectorAll(".nav-boton[data-seccion]");
const secciones = document.querySelectorAll(".seccion");

for (const boton of botonesNav) {
  boton.addEventListener("click", () => {
    const nombre = boton.dataset.seccion;
    activarSeccion(nombre);
  });
}

export function activarSeccion(nombre) {
  for (const b of botonesNav) {
    b.classList.toggle("activa", b.dataset.seccion === nombre);
  }
  for (const s of secciones) {
    s.classList.toggle("activa", s.id === `seccion-${nombre}`);
  }
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
