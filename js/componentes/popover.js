// Menús flotantes (fecha, prioridad, recordatorio, destino…).
let abierto = null;

export function cerrarPopover() {
  if (!abierto) return;
  abierto.el.remove();
  document.removeEventListener("pointerdown", abierto.fuera, true);
  document.removeEventListener("keydown", abierto.tecla, true);
  window.removeEventListener("resize", abierto.reubicar);
  abierto.alCerrar?.();
  abierto = null;
}

// construir(contenedor, cerrar) llena el menú. Devuelve el elemento.
export function abrirPopover(ancla, construir, { ancho = 260, alCerrar } = {}) {
  cerrarPopover();
  const el = document.createElement("div");
  el.className = "popover";
  el.style.width = `${ancho}px`;
  (ancla.closest("dialog") || document.body).append(el);

  const reubicar = () => {
    const r = ancla.getBoundingClientRect();
    const alto = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 6;
    if (top + alto > vh - 8 && r.top - alto - 6 > 8) top = r.top - alto - 6;
    top = Math.max(8, Math.min(top, vh - alto - 8));
    let left = Math.min(r.left, vw - ancho - 8);
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.maxHeight = `${vh - 16}px`;
  };

  const fuera = (e) => {
    if (!el.contains(e.target) && !ancla.contains(e.target)) cerrarPopover();
  };
  const tecla = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      cerrarPopover();
      ancla.focus?.();
    }
  };
  abierto = { el, fuera, tecla, reubicar, alCerrar };
  construir(el, cerrarPopover, reubicar);
  reubicar();
  document.addEventListener("pointerdown", fuera, true);
  document.addEventListener("keydown", tecla, true);
  window.addEventListener("resize", reubicar);
  return el;
}

export function popoverAbierto() {
  return !!abierto;
}
