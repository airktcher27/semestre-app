// Núcleo compartido entre las pestañas: estado, guardado, utilidades y catálogos.

export const VERSION = "0.4.1";
export const ESQUEMA = 2;

export const estado = { datos: null };

// app.js conecta estas funciones al arrancar.
export const ganchos = {
  guardar: () => {},
  pintar: () => {},
  toast: () => {},
};

export const guardar = (opciones) => ganchos.guardar(opciones);
export const pintar = () => ganchos.pintar();
export const toast = (texto, opciones) => ganchos.toast(texto, opciones);

export let anterior = null; // copia para "Deshacer"
export function antesDeCambio() {
  anterior = clonar(estado.datos);
}
export function tomarAnterior() {
  const a = anterior;
  anterior = null;
  return a;
}
export function olvidarAnterior() {
  anterior = null;
}

// ---------- utilidades ----------
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const clonar = (o) => JSON.parse(JSON.stringify(o));

export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function preferencia(clave, porDefecto) {
  try {
    const v = localStorage.getItem(`semestre:${clave}`);
    return v === null ? porDefecto : JSON.parse(v);
  } catch {
    return porDefecto;
  }
}
export function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(`semestre:${clave}`, JSON.stringify(valor));
  } catch {}
}

// ---------- catálogos ----------
export const COLORES = [
  "#dc4c3e", "#e8833a", "#d9a21b", "#7cb342", "#2f9e6a", "#159ba3",
  "#2b7fc4", "#5b5fd6", "#9b4fb8", "#c2458b", "#8d6e63", "#6b7280",
];

export const PRIORIDADES = {
  1: { nombre: "Prioridad 1", color: "#d1453b" },
  2: { nombre: "Prioridad 2", color: "#eb8909" },
  3: { nombre: "Prioridad 3", color: "#246fe0" },
  4: { nombre: "Sin prioridad", color: "var(--texto-3)" },
};

export const RECORDATORIOS = [
  { valor: 0, texto: "A la hora" },
  { valor: 10, texto: "10 minutos antes" },
  { valor: 30, texto: "30 minutos antes" },
  { valor: 60, texto: "1 hora antes" },
  { valor: 180, texto: "3 horas antes" },
  { valor: 1440, texto: "1 día antes" },
];

export function textoRecordatorio(min) {
  return RECORDATORIOS.find((r) => r.valor === min)?.texto || `${min} min antes`;
}

export const TIPOS_EVALUACION = { entrega: "Entrega", parcial: "Parcial" };
export const TIPOS_CLASE = { clase: "Clase", laboratorio: "Laboratorio", tutoria: "Tutoría", otro: "Otro" };

// ---------- consultas ----------
export function semestre() {
  const d = estado.datos;
  return d.semestres.find((s) => s.id === d.semestreActivo);
}

export function buscarSemestre(id) {
  return estado.datos.semestres.find((s) => s.id === id);
}

export function buscarMateria(idMateria, idSemestre = estado.datos.semestreActivo) {
  return buscarSemestre(idSemestre)?.materias.find((m) => m.id === idMateria) || null;
}

export function buscarLista(id) {
  return estado.datos.listas.find((l) => l.id === id) || null;
}

export function buscarTarea(id) {
  return estado.datos.tareas.find((t) => t.id === id) || null;
}

// Nombre y color de donde vive una tarea.
export function infoDestino(destino) {
  if (!destino || destino.tipo === "bandeja") return { nombre: "Bandeja de entrada", color: "var(--texto-3)", simbolo: "▢" };
  if (destino.tipo === "lista") {
    const l = buscarLista(destino.id);
    return l ? { nombre: l.nombre, color: l.color, simbolo: "#" } : { nombre: "Lista borrada", color: "var(--texto-3)", simbolo: "#" };
  }
  const m = buscarMateria(destino.id, destino.semestreId);
  const s = buscarSemestre(destino.semestreId);
  if (!m) return { nombre: "Materia borrada", color: "var(--texto-3)", simbolo: "●" };
  const otroSemestre = destino.semestreId !== estado.datos.semestreActivo ? ` (${s.nombre})` : "";
  return { nombre: m.nombre + otroSemestre, color: m.color, simbolo: "●" };
}

export function mismoDestino(a, b) {
  const ta = a?.tipo || "bandeja";
  const tb = b?.tipo || "bandeja";
  if (ta !== tb) return false;
  if (ta === "bandeja") return true;
  return a.id === b.id && (ta !== "materia" || a.semestreId === b.semestreId);
}

// El trabajo (de la pestaña Notas) al que está ligada una tarea.
export function trabajoDeTarea(tarea) {
  if (!tarea?.evaluacion || tarea.destino?.tipo !== "materia") return null;
  const m = buscarMateria(tarea.destino.id, tarea.destino.semestreId);
  return m?.trabajos.find((t) => t.id === tarea.evaluacion.trabajoId) || null;
}

export function tareaDeTrabajo(idTrabajo) {
  return estado.datos.tareas.find((t) => t.evaluacion?.trabajoId === idTrabajo) || null;
}

export function nuevaTarea(valores = {}) {
  return {
    id: nuevoId(),
    titulo: "",
    descripcion: "",
    fecha: null,
    hora: null,
    prioridad: 4,
    recordatorio: null,
    destino: { tipo: "bandeja" },
    evaluacion: null,
    hecha: false,
    hechaEn: null,
    creada: new Date().toISOString(),
    ...valores,
  };
}
