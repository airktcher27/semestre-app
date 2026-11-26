// Pestaña Tareas: cosas por hacer agrupadas por día (estilo Todoist), con listas propias.
import {
  estado, $, escapar, nuevoId, guardar, pintar, toast, antesDeCambio,
  PRIORIDADES, TIPOS_EVALUACION, COLORES, semestre, buscarLista, buscarTarea,
  infoDestino, mismoDestino, trabajoDeTarea, preferencia, guardarPreferencia, textoRecordatorio,
} from "../nucleo.js";
import { hoyISO, sumarDias, fechaLarga, fechaRelativa, horaBonita, capital, atajos, DIAS_CORTOS, diaSemana, fechaCorta } from "../fechas.js";
import { crearComposer, ICONOS } from "../componentes/composer.js";
import { abrirPopover } from "../componentes/popover.js";
import { formatoNota, formatoPorcentaje } from "../calculos.js";

let filtro = preferencia("filtroTareas", { tipo: "todas" });
let verCompletadas = preferencia("verCompletadas", false);
let orden = preferencia("ordenTareas", "hora");
const plegadas = new Set(preferencia("seccionesPlegadas", []));

let composerActivo = null; // { el, seccion, tareaId }
let repintarAlCerrar = false;

function filtroValido() {
  if (filtro.tipo === "todas" || filtro.tipo === "bandeja") return true;
  if (filtro.tipo === "lista") return !!buscarLista(filtro.id);
  if (filtro.tipo === "materia") return filtro.semestreId === estado.datos.semestreActivo && semestre().materias.some((m) => m.id === filtro.id);
  return false;
}

function pasaFiltro(t) {
  if (filtro.tipo === "todas") return true;
  return mismoDestino(t.destino, filtro);
}

function ordenar(a, b) {
  const porHora = (x, y) => (x.hora && y.hora ? x.hora.localeCompare(y.hora) : x.hora ? -1 : y.hora ? 1 : 0);
  const porPrioridad = (x, y) => x.prioridad - y.prioridad;
  const r = orden === "prioridad" ? porPrioridad(a, b) || porHora(a, b) : porHora(a, b) || porPrioridad(a, b);
  return r || (a.fecha || "").localeCompare(b.fecha || "") || a.creada.localeCompare(b.creada);
}

// Arma las secciones visibles.
export function secciones(tareas, hoy = hoyISO()) {
  const pendientes = tareas.filter((t) => !t.hecha);
  const s = [];
  const atrasadas = pendientes.filter((t) => t.fecha && t.fecha < hoy);
  if (atrasadas.length) s.push({ id: "atrasadas", titulo: "Atrasadas", tareas: atrasadas, mostrarFecha: true, alerta: true });
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(hoy, i);
    const del = pendientes.filter((t) => t.fecha === f);
    if (i > 1 && del.length === 0) continue;
    const prefijo = i === 0 ? "Hoy: " : i === 1 ? "Mañana: " : "";
    s.push({ id: `dia-${f}`, titulo: prefijo + capital(fechaLarga(f, hoy)), tareas: del, fecha: f, esHoy: i === 0 });
  }
  const limite = sumarDias(hoy, 6);
  const despues = pendientes.filter((t) => t.fecha && t.fecha > limite);
  if (despues.length) s.push({ id: "despues", titulo: "Más adelante", tareas: despues.sort((a, b) => a.fecha.localeCompare(b.fecha)), mostrarFecha: true, ordenFijo: true, fecha: sumarDias(hoy, 7) });
  const sinFecha = pendientes.filter((t) => !t.fecha);
  s.push({ id: "sin-fecha", titulo: "Sin fecha", tareas: sinFecha, fecha: null });
  for (const sec of s) if (!sec.ordenFijo) sec.tareas.sort(ordenar);
  return s;
}

export function pintarTareas() {
  if (composerActivo && document.contains(composerActivo.el)) {
    repintarAlCerrar = true;
    pintarFiltros();
    return;
  }
  composerActivo = null;
  if (!filtroValido()) filtro = { tipo: "todas" };
  pintarFiltros();
  const hoy = hoyISO();
  const visibles = estado.datos.tareas.filter(pasaFiltro);
  const secs = secciones(visibles, hoy);
  let html = secs.map((sec) => htmlSeccion(sec, hoy)).join("");
  if (verCompletadas) {
    const hechas = visibles.filter((t) => t.hecha).sort((a, b) => (b.hechaEn || "").localeCompare(a.hechaEn || "")).slice(0, 60);
    html += htmlSeccion({ id: "completadas", titulo: "Completadas", tareas: hechas, mostrarFecha: true, sinAgregar: true }, hoy);
  }
  $("#secciones").innerHTML = html;
}

function pintarFiltros() {
  const d = estado.datos;
  const s = semestre();
  const chip = (f, nombre, color, simbolo, cuenta) => {
    const activo = f.tipo === "todas" ? filtro.tipo === "todas" : mismoDestino(f, filtro) && filtro.tipo !== "todas";
    return `<button class="filtro ${activo ? "activo" : ""}" data-filtro='${escapar(JSON.stringify(f))}'>${simbolo ? `<span class="simbolo" style="color:${color}">${simbolo}</span>` : ""}${escapar(nombre)}${cuenta ? `<span class="cuenta">${cuenta}</span>` : ""}</button>`;
  };
  const pendientesDe = (f) => d.tareas.filter((t) => !t.hecha && (f.tipo === "todas" || mismoDestino(t.destino, f))).length;
  const filtros = [
    chip({ tipo: "todas" }, "Todas", null, null, pendientesDe({ tipo: "todas" })),
    chip({ tipo: "bandeja" }, "Bandeja", "var(--texto-3)", "▢", pendientesDe({ tipo: "bandeja" })),
    ...d.listas.map((l) => chip({ tipo: "lista", id: l.id }, l.nombre, l.color, "#", pendientesDe({ tipo: "lista", id: l.id }))),
    ...s.materias.map((m) => { const f = { tipo: "materia", semestreId: s.id, id: m.id }; return chip(f, m.nombre, m.color, "●", pendientesDe(f)); }),
  ];
  $("#filtros-tareas").innerHTML = filtros.join("") + `<button class="filtro nuevo" data-accion="nueva-lista">+ Lista</button>`;

  let titulo = "Próximas";
  let editable = "";
  if (filtro.tipo !== "todas") {
    const info = infoDestino(filtro);
    titulo = `<span class="simbolo" style="color:${info.color}">${info.simbolo}</span> ${escapar(info.nombre)}`;
    if (filtro.tipo === "lista") editable = `<button class="boton fantasma boton-icono" data-accion="editar-lista" title="Editar lista" aria-label="Editar lista">✎</button>`;
  }
  $("#titulo-tareas").innerHTML = titulo + editable;
  $("#ver-completadas").checked = verCompletadas;
  $("#orden-tareas").value = orden;
}

function htmlSeccion(sec, hoy) {
  const plegada = plegadas.has(sec.id.startsWith("dia-") ? (sec.esHoy ? "hoy" : sec.id) : sec.id);
  const acciones = sec.id === "atrasadas"
    ? `<button class="enlace-accion" data-accion="reprogramar">Reprogramar</button>`
    : "";
  return `
  <section class="seccion ${plegada ? "plegada" : ""} ${sec.alerta ? "alerta" : ""}" data-seccion="${sec.id}" ${sec.fecha !== undefined ? `data-fecha="${sec.fecha ?? ""}"` : ""}>
    <header class="seccion-cabeza">
      <button class="seccion-plegar" data-accion="plegar" aria-label="Plegar sección"><span class="flecha">›</span></button>
      <h2>${escapar(sec.titulo)}</h2><span class="contador">${sec.tareas.length || ""}</span>
      <span class="espaciador"></span>${acciones}
      <button class="seccion-menu" data-accion="menu-seccion" aria-label="Más opciones">···</button>
    </header>
    <div class="seccion-cuerpo">
      ${sec.tareas.map((t) => htmlTarea(t, sec, hoy)).join("")}
      ${sec.sinAgregar ? "" : `<button class="anadir-tarea" data-accion="anadir"><span class="mas">+</span> Añadir tarea</button>`}
    </div>
  </section>`;
}

function htmlTarea(t, sec, hoy) {
  const p = PRIORIDADES[t.prioridad];
  const info = infoDestino(t.destino);
  const tr = trabajoDeTarea(t);
  const meta = [];
  if (t.fecha && (sec.mostrarFecha || t.hecha)) {
    meta.push(`<span class="meta-fecha ${!t.hecha && t.fecha < hoy ? "vencida" : ""}">${ICONOS.fecha}${escapar(fechaRelativa(t.fecha, hoy))}${t.hora ? ` ${horaBonita(t.hora)}` : ""}</span>`);
  } else if (t.hora) {
    meta.push(`<span class="meta-fecha">${ICONOS.fecha}${horaBonita(t.hora)}</span>`);
  }
  if (t.recordatorio !== null) meta.push(`<span class="meta-icono" title="${escapar(textoRecordatorio(t.recordatorio))}">${ICONOS.alarma}</span>`);
  if (tr) {
    const nota = tr.nota !== null && tr.nota !== undefined ? ` · nota ${formatoNota(tr.nota, 1)}` : "";
    meta.push(`<span class="meta-evaluacion">${TIPOS_EVALUACION[t.evaluacion.tipo]} · ${formatoPorcentaje(tr.porcentaje)}${nota}</span>`);
  }
  return `
  <div class="tarea ${t.hecha ? "hecha" : ""}" data-tarea="${t.id}">
    <button class="check" style="--p:${p.color}" data-accion="completar" aria-label="${t.hecha ? "Marcar como pendiente" : "Completar"}: ${escapar(t.titulo)}" data-prioridad="${t.prioridad}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.3l2.6 2.6L12 5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="tarea-cuerpo" data-accion="editar">
      <div class="tarea-titulo">${escapar(t.titulo)}</div>
      ${t.descripcion ? `<div class="tarea-desc">${escapar(t.descripcion)}</div>` : ""}
      <div class="tarea-meta">${meta.join("")}<span class="meta-destino">${escapar(info.nombre)} <span class="simbolo" style="color:${info.color}">${info.simbolo}</span></span></div>
    </div>
  </div>`;
}

// ---------- composer en línea ----------
// "selector" ubica dónde abrirlo; se vuelve a buscar después de cerrar otro composer
// (cerrarlo repinta la lista y los elementos viejos dejan de existir).
function abrirComposer({ selector, tarea = null, valores = {} }) {
  if (composerActivo) cerrarComposer();
  const ancla = document.querySelector(selector);
  if (!ancla) return;
  const c = crearComposer({
    tarea,
    valores,
    alTerminar: (resultado) => {
      const seguir = resultado === "guardada" && !tarea; // al crear, queda abierto para la siguiente
      cerrarComposer();
      if (seguir && seccionDe) abrirComposer({ selector: `[data-seccion="${CSS.escape(seccionDe)}"] [data-accion=anadir]`, valores: { ...valores, titulo: "", descripcion: "" } });
    },
  });
  const seccionDe = ancla.closest("[data-seccion]")?.dataset.seccion;
  ancla.replaceWith(c);
  composerActivo = { el: c };
  c.enfocar();
}

const selectorTarea = (id) => `#secciones [data-tarea="${CSS.escape(id)}"]`;
const selectorAnadir = (idSeccion) => `#secciones [data-seccion="${CSS.escape(idSeccion)}"] [data-accion=anadir]`;

function cerrarComposer() {
  if (!composerActivo) return;
  composerActivo.el.remove();
  composerActivo = null;
  repintarAlCerrar = false;
  pintarTareas();
}

function valoresParaSeccion(seccionEl) {
  const valores = {};
  if (seccionEl.dataset.fecha) valores.fecha = seccionEl.dataset.fecha;
  if (filtro.tipo !== "todas") valores.destino = { ...filtro };
  return valores;
}

function completar(id) {
  const t = buscarTarea(id);
  if (!t) return;
  antesDeCambio();
  t.hecha = !t.hecha;
  t.hechaEn = t.hecha ? new Date().toISOString() : null;
  guardar({ deshacible: true });
  const fila = document.querySelector(`[data-tarea="${CSS.escape(id)}"]`);
  if (fila && t.hecha && !verCompletadas) {
    fila.classList.add("completando");
    setTimeout(pintar, 280);
  } else pintar();
  if (t.hecha) {
    const tr = trabajoDeTarea(t);
    const extra = tr && (tr.nota === null || tr.nota === undefined) ? " Cuando tengas la nota, ábrela y ponla." : "";
    toast(`Completaste "${t.titulo}".${extra}`, { deshacer: true });
  }
}

// ---------- listas propias ----------
let listaEditando = null;
let colorLista = COLORES[6];

function abrirLista(id = null) {
  listaEditando = id;
  const l = id ? buscarLista(id) : null;
  const f = $("#form-lista");
  f.reset();
  $("#titulo-lista").textContent = l ? "Editar lista" : "Nueva lista";
  $("#boton-borrar-lista").classList.toggle("oculto", !l);
  $("#error-lista").textContent = "";
  f.nombre.value = l?.nombre || "";
  const usados = new Set(estado.datos.listas.map((x) => x.color));
  colorLista = l?.color || COLORES.slice().reverse().find((c) => !usados.has(c)) || COLORES[6];
  pintarColoresLista();
  $("#dialogo-lista").showModal();
  f.nombre.focus();
}

function pintarColoresLista() {
  $("#colores-lista").innerHTML = COLORES.map((c) => `<button type="button" class="color-opcion" style="background:${c}" data-color="${c}" aria-pressed="${c === colorLista}" aria-label="Color ${c}"></button>`).join("");
}

export function iniciarTareas() {
  $("#vista-tareas").addEventListener("click", (e) => {
    const f = e.target.closest("[data-filtro]");
    if (f) {
      filtro = JSON.parse(f.dataset.filtro);
      guardarPreferencia("filtroTareas", filtro);
      cerrarComposer();
      pintarTareas();
      return;
    }
    const b = e.target.closest("[data-accion]");
    if (!b || b.closest(".composer")) return;
    const sec = b.closest("[data-seccion]");
    const fila = b.closest("[data-tarea]");
    switch (b.dataset.accion) {
      case "completar": completar(fila.dataset.tarea); break;
      case "editar": abrirComposer({ selector: selectorTarea(fila.dataset.tarea), tarea: buscarTarea(fila.dataset.tarea) }); break;
      case "anadir": abrirComposer({ selector: selectorAnadir(sec.dataset.seccion), valores: valoresParaSeccion(sec) }); break;
      case "plegar": {
        const clave = sec.dataset.seccion === `dia-${hoyISO()}` ? "hoy" : sec.dataset.seccion;
        plegadas.has(clave) ? plegadas.delete(clave) : plegadas.add(clave);
        guardarPreferencia("seccionesPlegadas", [...plegadas]);
        sec.classList.toggle("plegada");
        break;
      }
      case "menu-seccion":
        abrirPopover(b, (pop, cerrar) => {
          pop.innerHTML = `<div class="pop-lista">
            ${sec.dataset.seccion !== "completadas" ? `<button type="button" class="pop-opcion" data-op="anadir"><span class="icono-atajo">+</span><span>Añadir tarea aquí</span></button>` : ""}
            <div class="pop-grupo">Ordenar por</div>
            <button type="button" class="pop-opcion ${orden === "hora" ? "elegida" : ""}" data-op="orden-hora"><span>Hora y luego prioridad</span>${orden === "hora" ? `<span class="derecha">✓</span>` : ""}</button>
            <button type="button" class="pop-opcion ${orden === "prioridad" ? "elegida" : ""}" data-op="orden-prioridad"><span>Prioridad y luego hora</span>${orden === "prioridad" ? `<span class="derecha">✓</span>` : ""}</button>
          </div>`;
          pop.addEventListener("click", (ev) => {
            const op = ev.target.closest("[data-op]")?.dataset.op;
            if (!op) return;
            cerrar();
            if (op === "anadir") abrirComposer({ selector: selectorAnadir(sec.dataset.seccion), valores: valoresParaSeccion(sec) });
            else { orden = op.replace("orden-", ""); guardarPreferencia("ordenTareas", orden); pintarTareas(); }
          });
        }, { ancho: 230 });
        break;
      case "reprogramar": {
        const hoy = hoyISO();
        abrirPopover(b, (pop, cerrar) => {
          pop.innerHTML = `<div class="pop-grupo">Pasar las atrasadas a…</div><div class="pop-lista">${atajos(hoy).map((a) =>
            `<button type="button" class="pop-opcion" data-fecha="${a.fecha}"><span>${a.texto}</span><span class="derecha">${a.id === "proxima" ? `${DIAS_CORTOS[diaSemana(a.fecha)]} ${fechaCorta(a.fecha, hoy)}` : DIAS_CORTOS[diaSemana(a.fecha)]}</span></button>`).join("")}</div>`;
          pop.addEventListener("click", (ev) => {
            const x = ev.target.closest("[data-fecha]");
            if (!x) return;
            cerrar();
            antesDeCambio();
            const movidas = estado.datos.tareas.filter((t) => !t.hecha && t.fecha && t.fecha < hoy && pasaFiltro(t));
            movidas.forEach((t) => (t.fecha = x.dataset.fecha));
            guardar({ deshacible: true });
            pintar();
            toast(`${movidas.length} tarea(s) reprogramada(s)`, { deshacer: true });
          });
        }, { ancho: 240 });
        break;
      }
      case "nueva-lista": abrirLista(); break;
      case "editar-lista": abrirLista(filtro.id); break;
    }
  });

  $("#ver-completadas").addEventListener("change", (e) => {
    verCompletadas = e.target.checked;
    guardarPreferencia("verCompletadas", verCompletadas);
    pintarTareas();
  });
  $("#orden-tareas").addEventListener("change", (e) => {
    orden = e.target.value;
    guardarPreferencia("ordenTareas", orden);
    pintarTareas();
  });

  // Al cerrar el composer por clic afuera no se pierde nada: solo se cierra si está vacío.
  document.addEventListener("pointerdown", (e) => {
    if (!composerActivo || composerActivo.el.contains(e.target) || e.target.closest(".popover, dialog, [data-accion=anadir], [data-accion=editar], [data-accion=completar]")) return;
    const titulo = composerActivo.el.querySelector(".composer-titulo");
    if (!titulo.value.trim() && !composerActivo.el.querySelector(".composer-desc").value.trim()) cerrarComposer();
  });

  $("#colores-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]");
    if (!b) return;
    colorLista = b.dataset.color;
    pintarColoresLista();
  });

  $("#form-lista").addEventListener("submit", (e) => {
    const nombre = e.target.nombre.value.trim();
    const repetida = estado.datos.listas.some((l) => l.id !== listaEditando && l.nombre.toLowerCase() === nombre.toLowerCase());
    if (!nombre || repetida) {
      e.preventDefault();
      $("#error-lista").textContent = nombre ? "Ya tienes una lista con ese nombre." : "Ponle nombre.";
      return;
    }
    if (listaEditando) Object.assign(buscarLista(listaEditando), { nombre, color: colorLista });
    else {
      const l = { id: nuevoId(), nombre, color: colorLista };
      estado.datos.listas.push(l);
      filtro = { tipo: "lista", id: l.id };
      guardarPreferencia("filtroTareas", filtro);
    }
    guardar();
    pintar();
  });

  $("#boton-borrar-lista").addEventListener("click", () => {
    const l = buscarLista(listaEditando);
    if (!l) return;
    const suyas = estado.datos.tareas.filter((t) => t.destino?.tipo === "lista" && t.destino.id === l.id);
    if (!confirm(`¿Borrar la lista "${l.nombre}"?${suyas.length ? ` Sus ${suyas.length} tarea(s) pasan a la Bandeja de entrada.` : ""}`)) return;
    antesDeCambio();
    estado.datos.listas = estado.datos.listas.filter((x) => x.id !== l.id);
    suyas.forEach((t) => (t.destino = { tipo: "bandeja" }));
    filtro = { tipo: "todas" };
    guardarPreferencia("filtroTareas", filtro);
    guardar({ deshacible: true });
    $("#dialogo-lista").close();
    pintar();
    toast(`Borraste la lista "${l.nombre}"`, { deshacer: true });
  });
}
