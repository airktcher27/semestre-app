// Semestre · Fase 1: materias, notas, créditos, tema y paletas
import { crearSincronizador, ESTADOS } from "./comun/sync.js";
import {
  resumenMateria, resumenSemestre, estadoMateria,
  formatoNota, formatoPorcentaje, interpretarNota, interpretarPorcentaje,
} from "./calculos.js";

const VERSION = "0.1.0";
const ESQUEMA = 1;

const PALETAS = [
  { id: "tomate", nombre: "Tomate", color: "#dc4c3e" },
  { id: "indigo", nombre: "Índigo", color: "#5b5fd6" },
  { id: "esmeralda", nombre: "Esmeralda", color: "#1f9a6f" },
  { id: "oceano", nombre: "Océano", color: "#2b7fc4" },
  { id: "ciruela", nombre: "Ciruela", color: "#9b4fb8" },
  { id: "ambar", nombre: "Ámbar", color: "#c9821a" },
  { id: "grafito", nombre: "Grafito", color: "#55606e" },
];

const COLORES_MATERIA = [
  "#dc4c3e", "#e8833a", "#d9a21b", "#7cb342", "#2f9e6a", "#159ba3",
  "#2b7fc4", "#5b5fd6", "#9b4fb8", "#c2458b", "#8d6e63", "#6b7280",
];

const ETIQUETA_ESTADO = { bien: "Vas bien", cuidado: "Cerca del límite", riesgo: "Por debajo", "sin-notas": "Sin notas" };

// ---------- utilidades ----------
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const id = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clonar = (o) => JSON.parse(JSON.stringify(o));

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// 4 → "4,0" · 3.85 → "3,85"
function notaEditable(n) {
  return (Number.isInteger(n) ? n.toFixed(1) : String(n)).replace(".", ",");
}

function nombreSemestreActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${fecha.getMonth() < 6 ? 1 : 2}`;
}

function datosIniciales() {
  const s = { id: id(), nombre: nombreSemestreActual(), creado: new Date().toISOString(), materias: [] };
  return {
    esquema: ESQUEMA,
    ajustes: { notaAprobacion: 3.0, tema: "auto", paleta: "tomate" },
    semestres: [s],
    semestreActivo: s.id,
  };
}

// Completa campos que falten (datos viejos o respaldos de otra versión).
function normalizar(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.semestres)) return datosIniciales();
  d.esquema = ESQUEMA;
  d.ajustes = { notaAprobacion: 3.0, tema: "auto", paleta: "tomate", ...(d.ajustes || {}) };
  if (d.semestres.length === 0) d.semestres.push({ id: id(), nombre: nombreSemestreActual(), creado: new Date().toISOString(), materias: [] });
  for (const s of d.semestres) {
    s.materias ||= [];
    for (const m of s.materias) {
      m.trabajos ||= [];
      m.color ||= COLORES_MATERIA[0];
    }
  }
  if (!d.semestres.some((s) => s.id === d.semestreActivo)) d.semestreActivo = d.semestres[d.semestres.length - 1].id;
  return d;
}

// ---------- estado ----------
let datos;
const abiertas = new Set(JSON.parse(localStorage.getItem("semestre:abiertas") || "[]"));

const sync = crearSincronizador({
  app: "semestre",
  alCambiar: ({ estado, mensaje, datosCambiaron }) => {
    if (datosCambiaron) {
      datos = normalizar(clonar(sync.datos));
      aplicarApariencia();
      pintar();
    }
    pintarEstadoSync(estado, mensaje);
    if (estado === ESTADOS.CONFLICTO) abrirConflicto();
  },
});

function semestre() {
  return datos.semestres.find((s) => s.id === datos.semestreActivo);
}

function buscarMateria(idMateria) {
  return semestre().materias.find((m) => m.id === idMateria);
}

let anterior = null; // para "Deshacer"
function guardar({ deshacible = false } = {}) {
  sync.guardar(clonar(datos));
  if (!deshacible) anterior = null;
}

function antesDeCambio() {
  anterior = clonar(datos);
}

// ---------- apariencia ----------
function aplicarApariencia() {
  const { tema, paleta } = datos.ajustes;
  const real = tema === "claro" || tema === "oscuro" ? tema : matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "oscuro";
  document.documentElement.dataset.tema = real;
  document.documentElement.dataset.paleta = paleta;
  $('meta[name="theme-color"]').setAttribute("content", real === "claro" ? "#f6f6f4" : "#1e1e1e");
  localStorage.setItem("semestre:apariencia", JSON.stringify({ tema, paleta }));
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => datos && aplicarApariencia());

// ---------- pintar ----------
function pintar() {
  // Conserva el foco y la posición del cursor al volver a pintar.
  const activo = document.activeElement;
  const claveFoco = activo?.dataset?.foco;
  const seleccion = claveFoco && "selectionStart" in activo ? [activo.selectionStart, activo.selectionEnd] : null;

  pintarSelectorSemestre();
  pintarResumen();
  pintarMaterias();

  if (claveFoco) {
    const el = document.querySelector(`[data-foco="${CSS.escape(claveFoco)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (seleccion && el.setSelectionRange) try { el.setSelectionRange(...seleccion); } catch {}
    }
  }
}

function pintarSelectorSemestre() {
  const sel = $("#selector-semestre");
  sel.innerHTML =
    datos.semestres.map((s) => `<option value="${s.id}" ${s.id === datos.semestreActivo ? "selected" : ""}>${escapar(s.nombre)}</option>`).join("") +
    `<option value="__nuevo">+ Nuevo semestre…</option>`;
}

function pintarResumen() {
  const r = resumenSemestre(semestre());
  const aprob = datos.ajustes.notaAprobacion;
  let estado = "sin-notas";
  if (r.promedio !== null) estado = estadoMateria({ promedioEvaluado: r.promedio }, aprob);
  const detalleProm = r.promedio === null
    ? "Aparece cuando califiquen algo"
    : `Ponderado por créditos · ${r.creditosConNota} de ${r.creditosTotales} créditos con notas`;
  $("#resumen").innerHTML = `
    <div class="tarjeta-dato destacada">
      <div class="etiqueta">Promedio del semestre</div>
      <div class="valor" style="${r.promedio !== null ? `color:var(--${estado})` : ""}">${formatoNota(r.promedio)}</div>
      <div class="detalle">${detalleProm}</div>
    </div>
    <div class="tarjeta-dato"><div class="etiqueta">Materias</div><div class="valor">${r.materias}</div>
      <div class="detalle">${r.completas} con todas las notas</div></div>
    <div class="tarjeta-dato"><div class="etiqueta">Créditos</div><div class="valor">${r.creditosTotales}</div>
      <div class="detalle">${r.sinCreditos ? `${r.sinCreditos} materia(s) sin créditos` : "inscritos"}</div></div>
    <div class="tarjeta-dato"><div class="etiqueta">Para aprobar</div><div class="valor">${formatoNota(aprob, 1)}</div>
      <div class="detalle">Cámbialo en Ajustes</div></div>`;
  $("#contador-materias").textContent = r.materias ? `${r.materias}` : "";
}

function pintarMaterias() {
  const cont = $("#materias");
  const materias = semestre().materias;
  if (materias.length === 0) {
    cont.innerHTML = `<div class="vacio" style="grid-column:1/-1">
      <h2>Agrega tus materias</h2>
      <p>Para cada una pones sus créditos y después los trabajos con su porcentaje.<br>Las notas las vas llenando a medida que te califican.</p>
      <button class="boton primario" data-accion="nueva-materia">+ Agregar materia</button></div>`;
    return;
  }
  cont.innerHTML = materias.map(htmlMateria).join("") + `<button class="materia-nueva" data-accion="nueva-materia">+ Agregar materia</button>`;
}

function htmlMateria(m) {
  const r = resumenMateria(m);
  const estado = estadoMateria(r, datos.ajustes.notaAprobacion);
  const abierta = abiertas.has(m.id) || m.trabajos.length === 0;
  const meta = [m.codigo, `${m.creditos || 0} crédito${Number(m.creditos) === 1 ? "" : "s"}`, m.docente].filter(Boolean).map(escapar).join(" · ");

  let alerta = "";
  if (m.trabajos.length && !r.sumaCorrecta) {
    const dif = Math.round((100 - r.porcentajeTotal) * 100) / 100;
    alerta = `<div class="alerta-suma">Los porcentajes suman ${formatoPorcentaje(r.porcentajeTotal)}: ${dif > 0 ? `faltan ${formatoPorcentaje(dif)}` : `sobran ${formatoPorcentaje(-dif)}`}.</div>`;
  }

  const filas = m.trabajos.map((t) => `
    <div class="fila-trabajo" data-trabajo="${t.id}">
      <input class="campo-celda" data-campo="nombre" data-foco="${t.id}:nombre" value="${escapar(t.nombre)}" placeholder="Nombre del trabajo" aria-label="Nombre del trabajo" maxlength="80">
      <input class="campo-celda numero" data-campo="porcentaje" data-foco="${t.id}:porcentaje" value="${t.porcentaje ?? ""}" inputmode="decimal" aria-label="Porcentaje" placeholder="%">
      <input class="campo-celda numero nota-vacia" data-campo="nota" data-foco="${t.id}:nota" value="${t.nota === null || t.nota === undefined ? "" : notaEditable(t.nota)}" inputmode="decimal" aria-label="Nota" placeholder="—">
      <button class="boton-quitar" data-accion="quitar-trabajo" title="Quitar trabajo" aria-label="Quitar ${escapar(t.nombre)}">×</button>
    </div>`).join("");

  return `
  <article class="materia ${abierta ? "abierta" : ""}" data-materia="${m.id}" style="--color-materia:${m.color};--color-estado:var(--${estado})">
    <div class="materia-cabeza">
      <div class="materia-titulo">
        <h3>${escapar(m.nombre)}</h3>
        <div class="meta">${meta}</div>
      </div>
      <button class="boton fantasma boton-icono" data-accion="editar-materia" title="Editar materia" aria-label="Editar ${escapar(m.nombre)}">✎</button>
    </div>
    <div class="materia-notas">
      <div><div class="nota-etiqueta">Acumulada</div><div class="nota-grande">${formatoNota(r.acumulada)}</div></div>
      <div><div class="nota-etiqueta">Sobre lo evaluado</div><div class="nota-chica">${formatoNota(r.promedioEvaluado)}</div></div>
      <span class="chip-estado" data-estado="${estado}">${ETIQUETA_ESTADO[estado]}</span>
    </div>
    <div class="barra-progreso">
      <div class="barra-pista" role="progressbar" aria-valuenow="${r.evaluado}" aria-valuemin="0" aria-valuemax="100" aria-label="Porcentaje evaluado">
        <div class="barra-relleno" style="width:${Math.min(100, r.evaluado)}%"></div>
      </div>
      <div class="barra-leyenda"><span>${formatoPorcentaje(r.evaluado)} evaluado</span><span>${formatoPorcentaje(r.pendiente)} pendiente</span></div>
    </div>
    ${alerta}
    <div class="trabajos">
      <button class="trabajos-alternar" data-accion="alternar">
        <span class="flecha">›</span> Trabajos <span style="color:var(--texto-3)">${r.calificados}/${r.trabajos} calificados</span>
      </button>
      <div class="trabajos-lista">
        ${m.trabajos.length ? `<div class="fila-encabezado"><span>Trabajo</span><span>%</span><span>Nota</span><span></span></div>` : ""}
        ${filas}
        <button class="agregar-trabajo" data-accion="agregar-trabajo"><span class="mas">+</span> Agregar trabajo</button>
      </div>
    </div>
  </article>`;
}

// ---------- estado de sincronización ----------
const TEXTO_SYNC = {
  [ESTADOS.SIN_CONFIGURAR]: "Sin conectar",
  [ESTADOS.BLOQUEADO]: "Falta contraseña",
  [ESTADOS.SINCRONIZADO]: "Sincronizado",
  [ESTADOS.PENDIENTE]: "Guardando…",
  [ESTADOS.SINCRONIZANDO]: "Sincronizando…",
  [ESTADOS.CONFLICTO]: "Conflicto",
  [ESTADOS.ERROR]: "Error",
  [ESTADOS.SIN_CONEXION]: "Sin conexión",
};

function pintarEstadoSync(estado, mensaje) {
  const b = $("#boton-sync");
  b.dataset.estado = estado;
  $(".texto", b).textContent = TEXTO_SYNC[estado] || estado;
  b.title = mensaje || TEXTO_SYNC[estado] || "";

  const avisos = $("#avisos");
  if (estado === ESTADOS.ERROR) {
    avisos.innerHTML = `<div class="aviso alerta"><p><b>No se pudo sincronizar.</b> ${escapar(mensaje)} Tus cambios siguen guardados en este dispositivo.</p>
      <button class="boton" data-accion="reintentar">Reintentar</button></div>`;
  } else if (estado === ESTADOS.BLOQUEADO) {
    avisos.innerHTML = `<div class="aviso alerta"><p>${escapar(mensaje || "Escribe tu contraseña de cifrado para sincronizar en este dispositivo.")}</p>
      <button class="boton primario" data-accion="desbloquear">Escribir contraseña</button></div>`;
  } else if (estado === ESTADOS.SIN_CONFIGURAR && !localStorage.getItem("semestre:aviso-sync-oculto")) {
    avisos.innerHTML = `<div class="aviso"><p>Tus datos están guardados solo en este dispositivo. Conecta tu repo privado de GitHub para tenerlos también en el celular.</p>
      <button class="boton primario" data-accion="conectar">Conectar</button>
      <button class="boton fantasma" data-accion="ocultar-aviso-sync">Después</button></div>`;
  } else {
    avisos.innerHTML = "";
  }
  if ($("#dialogo-ajustes").open) pintarAjustesSync();
}

// ---------- toast ----------
let temporizadorToast;
function toast(texto, { deshacer = false } = {}) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${escapar(texto)}</span>${deshacer ? `<button>Deshacer</button>` : ""}`;
  if (deshacer) {
    $("button", t).onclick = () => {
      if (anterior) {
        datos = anterior;
        anterior = null;
        guardar();
        pintar();
      }
      t.remove();
    };
  }
  document.body.append(t);
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.remove(), deshacer ? 6000 : 3000);
}

// ---------- materias ----------
let materiaEditando = null;
let colorElegido = COLORES_MATERIA[0];

function abrirMateria(idMateria = null) {
  materiaEditando = idMateria;
  const f = $("#form-materia");
  f.reset();
  $("#error-materia").textContent = "";
  const m = idMateria ? buscarMateria(idMateria) : null;
  $("#titulo-materia").textContent = m ? "Editar materia" : "Nueva materia";
  $("#boton-borrar-materia").classList.toggle("oculto", !m);
  if (m) {
    f.nombre.value = m.nombre;
    f.docente.value = m.docente || "";
    f.creditos.value = m.creditos || "";
    f.codigo.value = m.codigo || "";
    colorElegido = m.color;
  } else {
    const usados = new Set(semestre().materias.map((x) => x.color));
    colorElegido = COLORES_MATERIA.find((c) => !usados.has(c)) || COLORES_MATERIA[0];
  }
  pintarColores();
  $("#dialogo-materia").showModal();
  f.nombre.focus();
}

function pintarColores() {
  $("#colores-materia").innerHTML = COLORES_MATERIA.map(
    (c) => `<button type="button" class="color-opcion" style="background:${c}" data-color="${c}" aria-pressed="${c === colorElegido}" aria-label="Color ${c}"></button>`
  ).join("");
}

$("#colores-materia").addEventListener("click", (e) => {
  const b = e.target.closest("[data-color]");
  if (!b) return;
  colorElegido = b.dataset.color;
  pintarColores();
});

$("#form-materia").addEventListener("submit", (e) => {
  const f = e.target;
  const nombre = f.nombre.value.trim();
  const creditos = parseInt(f.creditos.value, 10);
  if (!nombre) { e.preventDefault(); $("#error-materia").textContent = "Ponle nombre a la materia."; return; }
  if (!(creditos >= 1 && creditos <= 20)) { e.preventDefault(); $("#error-materia").textContent = "Los créditos deben ser un número entre 1 y 20."; return; }
  const valores = { nombre, docente: f.docente.value.trim(), creditos, codigo: f.codigo.value.trim(), color: colorElegido };
  if (materiaEditando) {
    Object.assign(buscarMateria(materiaEditando), valores);
  } else {
    const nueva = { id: id(), ...valores, trabajos: [] };
    semestre().materias.push(nueva);
    abiertas.add(nueva.id);
    guardarAbiertas();
  }
  guardar();
  pintar();
});

$("#boton-borrar-materia").addEventListener("click", () => {
  const m = buscarMateria(materiaEditando);
  if (!m) return;
  antesDeCambio();
  semestre().materias = semestre().materias.filter((x) => x.id !== m.id);
  guardar({ deshacible: true });
  $("#dialogo-materia").close();
  pintar();
  toast(`Borraste "${m.nombre}"`, { deshacer: true });
});

function guardarAbiertas() {
  localStorage.setItem("semestre:abiertas", JSON.stringify([...abiertas]));
}

// ---------- trabajos (edición en la tarjeta) ----------
$("#materias").addEventListener("change", (e) => {
  const input = e.target.closest("[data-campo]");
  if (!input) return;
  const m = buscarMateria(input.closest("[data-materia]").dataset.materia);
  const t = m?.trabajos.find((x) => x.id === input.closest("[data-trabajo]").dataset.trabajo);
  if (!t) return;
  const campo = input.dataset.campo;

  if (campo === "nombre") {
    t.nombre = input.value.trim() || "Trabajo";
  } else if (campo === "porcentaje") {
    const r = interpretarPorcentaje(input.value);
    if (!r.ok) { input.classList.add("invalido"); toast(r.error); return; }
    t.porcentaje = r.valor;
  } else if (campo === "nota") {
    const r = interpretarNota(input.value);
    if (!r.ok) { input.classList.add("invalido"); toast(r.error); return; }
    t.nota = r.valor;
  }
  input.classList.remove("invalido");
  guardar();
  pintar();
});

$("#materias").addEventListener("keydown", (e) => {
  // Enter en una celda pasa a la siguiente (como en una hoja de cálculo).
  if (e.key !== "Enter" || !e.target.matches(".campo-celda")) return;
  e.preventDefault();
  const celdas = [...e.target.closest(".trabajos-lista").querySelectorAll(".campo-celda")];
  const i = celdas.indexOf(e.target);
  e.target.blur();
  const siguiente = document.querySelector(`[data-foco="${CSS.escape(celdas[i + 1]?.dataset.foco || "")}"]`);
  (siguiente || e.target).focus();
});

// ---------- clics generales ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (b) {
    const tarjeta = b.closest("[data-materia]");
    const m = tarjeta ? buscarMateria(tarjeta.dataset.materia) : null;
    switch (b.dataset.accion) {
      case "nueva-materia": abrirMateria(); break;
      case "editar-materia": abrirMateria(m.id); break;
      case "alternar":
        abiertas.has(m.id) ? abiertas.delete(m.id) : abiertas.add(m.id);
        guardarAbiertas();
        tarjeta.classList.toggle("abierta");
        break;
      case "agregar-trabajo": {
        const r = resumenMateria(m);
        const sugerido = r.porcentajeTotal < 100 ? Math.round((100 - r.porcentajeTotal) * 100) / 100 : 10;
        const t = { id: id(), nombre: `Trabajo ${m.trabajos.length + 1}`, porcentaje: sugerido, nota: null };
        m.trabajos.push(t);
        abiertas.add(m.id);
        guardar();
        pintar();
        const campo = document.querySelector(`[data-foco="${t.id}:nombre"]`);
        campo?.focus();
        campo?.select();
        break;
      }
      case "quitar-trabajo": {
        const idT = b.closest("[data-trabajo]").dataset.trabajo;
        const t = m.trabajos.find((x) => x.id === idT);
        antesDeCambio();
        m.trabajos = m.trabajos.filter((x) => x.id !== idT);
        guardar({ deshacible: true });
        pintar();
        toast(`Quitaste "${t.nombre}"`, { deshacer: true });
        break;
      }
      case "conectar": abrirConectar(); break;
      case "desbloquear": abrirDesbloquear(); break;
      case "reintentar": sync.sincronizar(); break;
      case "ocultar-aviso-sync":
        localStorage.setItem("semestre:aviso-sync-oculto", "1");
        $("#avisos").innerHTML = "";
        break;
      case "sincronizar-ya": sync.sincronizar(); break;
      case "desconectar":
        if (confirm("¿Desconectar este dispositivo de GitHub? Los datos siguen aquí y en GitHub; solo deja de sincronizar.")) sync.desconectar();
        break;
    }
  }
  if (e.target.matches("[data-cerrar]")) e.target.closest("dialog").close();
});

// ---------- semestres ----------
let semestreEditando = null;

$("#selector-semestre").addEventListener("change", (e) => {
  if (e.target.value === "__nuevo") {
    e.target.value = datos.semestreActivo;
    abrirSemestre();
    return;
  }
  datos.semestreActivo = e.target.value;
  guardar();
  pintar();
});

function abrirSemestre(idSemestre = null) {
  semestreEditando = idSemestre;
  const f = $("#form-semestre");
  f.reset();
  $("#error-semestre").textContent = "";
  const s = idSemestre ? datos.semestres.find((x) => x.id === idSemestre) : null;
  $("#titulo-semestre").textContent = s ? "Renombrar semestre" : "Nuevo semestre";
  $("#copiar-materias-casilla").classList.toggle("oculto", !!s || semestre().materias.length === 0);
  $("#boton-borrar-semestre").classList.toggle("oculto", !s || datos.semestres.length < 2);
  f.nombre.value = s ? s.nombre : "";
  $("#dialogo-semestre").showModal();
  f.nombre.focus();
}

$("#form-semestre").addEventListener("submit", (e) => {
  const f = e.target;
  const nombre = f.nombre.value.trim();
  const repetido = datos.semestres.some((s) => s.nombre.toLowerCase() === nombre.toLowerCase() && s.id !== semestreEditando);
  if (!nombre || repetido) {
    e.preventDefault();
    $("#error-semestre").textContent = nombre ? "Ya tienes un semestre con ese nombre." : "Ponle nombre.";
    return;
  }
  if (semestreEditando) {
    datos.semestres.find((s) => s.id === semestreEditando).nombre = nombre;
  } else {
    const materias = f.copiar.checked
      ? semestre().materias.map((m) => ({ ...clonar(m), id: id(), trabajos: m.trabajos.map((t) => ({ ...t, id: id(), nota: null })) }))
      : [];
    const s = { id: id(), nombre, creado: new Date().toISOString(), materias };
    datos.semestres.push(s);
    datos.semestreActivo = s.id;
  }
  guardar();
  pintar();
  $("#dialogo-ajustes").close();
});

$("#boton-borrar-semestre").addEventListener("click", () => {
  const s = datos.semestres.find((x) => x.id === semestreEditando);
  if (!s || !confirm(`¿Borrar el semestre "${s.nombre}" con todas sus materias y notas?`)) return;
  antesDeCambio();
  datos.semestres = datos.semestres.filter((x) => x.id !== s.id);
  datos.semestreActivo = datos.semestres[datos.semestres.length - 1].id;
  guardar({ deshacible: true });
  $("#dialogo-semestre").close();
  $("#dialogo-ajustes").close();
  pintar();
  toast(`Borraste el semestre ${s.nombre}`, { deshacer: true });
});

// ---------- ajustes ----------
$("#boton-ajustes").addEventListener("click", abrirAjustes);
$("#boton-sync").addEventListener("click", () => {
  const e = sync.estado;
  if (e === ESTADOS.SIN_CONFIGURAR) abrirConectar();
  else if (e === ESTADOS.BLOQUEADO) abrirDesbloquear();
  else if (e === ESTADOS.CONFLICTO) abrirConflicto();
  else sync.sincronizar();
});

function abrirAjustes() {
  $("#version").textContent = VERSION;
  pintarAjustesApariencia();
  $("#nota-aprobacion").value = notaEditable(datos.ajustes.notaAprobacion);
  pintarAjustesSync();
  $("#dialogo-ajustes").showModal();
}

function pintarAjustesApariencia() {
  for (const b of $("#opciones-tema").children) b.setAttribute("aria-pressed", String(b.dataset.tema === datos.ajustes.tema));
  $("#opciones-paleta").innerHTML = PALETAS.map(
    (p) => `<button type="button" class="paleta-opcion" data-paleta="${p.id}" aria-pressed="${p.id === datos.ajustes.paleta}">
      <span class="muestra" style="background:${p.color}"></span>${p.nombre}</button>`
  ).join("");
}

$("#opciones-tema").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tema]");
  if (!b) return;
  datos.ajustes.tema = b.dataset.tema;
  aplicarApariencia();
  pintarAjustesApariencia();
  guardar();
});

$("#opciones-paleta").addEventListener("click", (e) => {
  const b = e.target.closest("[data-paleta]");
  if (!b) return;
  datos.ajustes.paleta = b.dataset.paleta;
  aplicarApariencia();
  pintarAjustesApariencia();
  guardar();
});

$("#nota-aprobacion").addEventListener("change", (e) => {
  const r = interpretarNota(e.target.value);
  if (!r.ok || r.valor === null) {
    toast("Escribe una nota entre 0 y 5.");
    e.target.value = notaEditable(datos.ajustes.notaAprobacion);
    return;
  }
  datos.ajustes.notaAprobacion = r.valor;
  guardar();
  pintar();
});

$("#boton-renombrar-semestre").addEventListener("click", () => abrirSemestre(datos.semestreActivo));
$("#boton-nuevo-semestre").addEventListener("click", () => abrirSemestre());

function pintarAjustesSync() {
  const c = sync.config;
  const info = $("#info-sync");
  const botones = $("#botones-sync");
  if (!c) {
    info.textContent = "No está conectada. Los datos viven solo en este dispositivo.";
    botones.innerHTML = `<button class="boton primario" data-accion="conectar">Conectar con GitHub</button>`;
    return;
  }
  const cuando = sync.ultimaSincronizacion ? new Date(sync.ultimaSincronizacion).toLocaleString("es-CO") : "aún no";
  info.innerHTML = `Conectada a <code>${escapar(c.usuario)}/${escapar(c.repo)}</code> · ${escapar(TEXTO_SYNC[sync.estado])} · última revisión: ${escapar(cuando)}`;
  botones.innerHTML = `
    <button class="boton" data-accion="sincronizar-ya">Sincronizar ahora</button>
    ${sync.estado === ESTADOS.BLOQUEADO ? `<button class="boton" data-accion="desbloquear">Escribir contraseña</button>` : ""}
    <button class="boton" data-accion="conectar">Cambiar conexión</button>
    <button class="boton peligro" data-accion="desconectar">Desconectar</button>`;
}

// ---------- conectar / desbloquear / conflicto ----------
function abrirConectar() {
  const f = $("#form-conectar");
  const c = sync.config;
  if (c) { f.usuario.value = c.usuario; f.repo.value = c.repo; }
  $("#error-conectar").textContent = "";
  $("#dialogo-conectar").showModal();
}

$("#form-conectar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const boton = $("#boton-conectar-ok");
  boton.disabled = true;
  boton.textContent = "Probando…";
  $("#error-conectar").textContent = "";
  try {
    await sync.configurar({
      usuario: f.usuario.value, repo: f.repo.value, token: f.token.value,
      contrasena: f.contrasena.value, recordar: f.recordar.checked,
    });
    $("#dialogo-conectar").close();
    f.token.value = "";
    f.contrasena.value = "";
    toast("Conectado con GitHub");
  } catch (err) {
    $("#error-conectar").textContent = err.name === "ContrasenaIncorrecta"
      ? "Ya hay datos en ese repo y esta contraseña no los abre. Usa la misma contraseña que en tu otro dispositivo."
      : err.message || String(err);
  } finally {
    boton.disabled = false;
    boton.textContent = "Conectar";
  }
});

function abrirDesbloquear() {
  $("#error-desbloquear").textContent = "";
  $("#form-desbloquear").reset();
  $("#dialogo-desbloquear").showModal();
}

$("#form-desbloquear").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await sync.desbloquear(f.contrasena.value, f.recordar.checked);
    $("#dialogo-desbloquear").close();
  } catch (err) {
    $("#error-desbloquear").textContent = err.name === "ContrasenaIncorrecta" ? "Esa contraseña no abre los datos." : err.message;
  }
});

function abrirConflicto() {
  const c = sync.conflicto;
  if (!c || $("#dialogo-conflicto").open) return;
  $("#detalle-conflicto").textContent = `Versión de GitHub guardada el ${new Date(c.guardado).toLocaleString("es-CO")}.`;
  $("#dialogo-conflicto").showModal();
}

$("#conflicto-local").addEventListener("click", async () => {
  $("#dialogo-conflicto").close();
  await sync.resolverConflicto("local");
});
$("#conflicto-remoto").addEventListener("click", async () => {
  descargarRespaldo("semestre-respaldo-antes-de-conflicto");
  $("#dialogo-conflicto").close();
  await sync.resolverConflicto("remoto");
});

// ---------- respaldo ----------
function descargarRespaldo(nombre = "semestre-respaldo") {
  const blob = new Blob([JSON.stringify({ app: "semestre", version: VERSION, exportado: new Date().toISOString(), datos }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#boton-exportar").addEventListener("click", () => descargarRespaldo());

$("#archivo-importar").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  try {
    const json = JSON.parse(await archivo.text());
    const nuevos = json.app === "semestre" ? json.datos : json;
    if (!nuevos || !Array.isArray(nuevos.semestres)) throw new Error("formato");
    if (!confirm("Esto reemplaza todos los datos actuales por los del respaldo. ¿Seguir?")) return;
    antesDeCambio();
    datos = normalizar(nuevos);
    guardar({ deshacible: true });
    aplicarApariencia();
    pintar();
    $("#dialogo-ajustes").close();
    toast("Respaldo restaurado", { deshacer: true });
  } catch {
    toast("Ese archivo no es un respaldo de Semestre.");
  }
});

// ---------- arranque ----------
// Si no hay nada guardado, se arranca con un semestre vacío que solo se guarda
// al primer cambio (así, al conectar un dispositivo nuevo, manda lo que hay en GitHub).
datos = normalizar(sync.datos ? clonar(sync.datos) : null);
aplicarApariencia();
pintar();
sync.iniciar();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
