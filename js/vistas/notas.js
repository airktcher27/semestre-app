// Pestaña Notas: materias, trabajos, notas y promedio del semestre.
import {
  estado, $, escapar, nuevoId, guardar, pintar, toast, antesDeCambio,
  semestre, buscarMateria, tareaDeTrabajo, COLORES, TIPOS_EVALUACION, preferencia, guardarPreferencia,
} from "../nucleo.js";
import {
  resumenMateria, resumenSemestre, estadoMateria,
  formatoNota, formatoPorcentaje, interpretarNota, interpretarPorcentaje,
} from "../calculos.js";
import { fechaRelativa, hoyISO } from "../fechas.js";
import { abrirTareaEnDialogo, ICONOS } from "../componentes/composer.js";

const ETIQUETA_ESTADO = { bien: "Vas bien", cuidado: "Cerca del límite", riesgo: "Por debajo", "sin-notas": "Sin notas" };
const abiertas = new Set(preferencia("abiertas", []));

// 4 → "4,0" · 3.85 → "3,85"
export function notaEditable(n) {
  return (Number.isInteger(n) ? n.toFixed(1) : String(n)).replace(".", ",");
}

export function pintarNotas() {
  pintarResumen();
  pintarMaterias();
}

function pintarResumen() {
  const r = resumenSemestre(semestre());
  const aprob = estado.datos.ajustes.notaAprobacion;
  const est = r.promedio === null ? "sin-notas" : estadoMateria({ promedioEvaluado: r.promedio }, aprob);
  const detalleProm = r.promedio === null
    ? "Aparece cuando califiquen algo"
    : `Ponderado por créditos · ${r.creditosConNota} de ${r.creditosTotales} créditos con notas`;
  $("#resumen").innerHTML = `
    <div class="tarjeta-dato destacada">
      <div class="etiqueta">Promedio del semestre</div>
      <div class="valor" style="${r.promedio !== null ? `color:var(--${est})` : ""}">${formatoNota(r.promedio)}</div>
      <div class="detalle">${detalleProm}</div>
    </div>
    <div class="tarjeta-dato"><div class="etiqueta">Materias</div><div class="valor">${r.materias}</div>
      <div class="detalle">${r.completas} con todas las notas</div></div>
    <div class="tarjeta-dato"><div class="etiqueta">Créditos</div><div class="valor">${r.creditosTotales}</div>
      <div class="detalle">${r.sinCreditos ? `${r.sinCreditos} materia(s) sin créditos` : "inscritos"}</div></div>`;
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
  const est = estadoMateria(r, estado.datos.ajustes.notaAprobacion);
  const abierta = abiertas.has(m.id) || m.trabajos.length === 0;
  const meta = [m.codigo, `${m.creditos || 0} crédito${Number(m.creditos) === 1 ? "" : "s"}`, m.docente].filter(Boolean).map(escapar).join(" · ");
  const hoy = hoyISO();

  let alerta = "";
  if (m.trabajos.length && !r.sumaCorrecta) {
    const dif = Math.round((100 - r.porcentajeTotal) * 100) / 100;
    alerta = `<div class="alerta-suma">Los porcentajes suman ${formatoPorcentaje(r.porcentajeTotal)}: ${dif > 0 ? `faltan ${formatoPorcentaje(dif)}` : `sobran ${formatoPorcentaje(-dif)}`}.</div>`;
  }

  const filas = m.trabajos.map((t) => {
    const tarea = tareaDeTrabajo(t.id);
    let fechaInfo = "";
    if (tarea) {
      const vencida = !tarea.hecha && tarea.fecha && tarea.fecha < hoy && (t.nota === null || t.nota === undefined);
      fechaInfo = `<button class="trabajo-fecha ${vencida ? "vencida" : ""} ${tarea.hecha ? "hecha" : ""}" data-accion="tarea-trabajo">
        ${TIPOS_EVALUACION[tarea.evaluacion.tipo]}${tarea.fecha ? ` · ${escapar(fechaRelativa(tarea.fecha, hoy))}` : " · sin fecha"}${tarea.hecha ? " ✓" : ""}</button>`;
    }
    return `
    <div class="fila-trabajo" data-trabajo="${t.id}">
      <div class="celda-nombre">
        <input class="campo-celda" data-campo="nombre" data-foco="${t.id}:nombre" value="${escapar(t.nombre)}" placeholder="Nombre del trabajo" aria-label="Nombre del trabajo" maxlength="80">
        ${fechaInfo}
      </div>
      <input class="campo-celda numero" data-campo="porcentaje" data-foco="${t.id}:porcentaje" value="${t.porcentaje ?? ""}" inputmode="decimal" aria-label="Porcentaje" placeholder="%">
      <input class="campo-celda numero nota-vacia" data-campo="nota" data-foco="${t.id}:nota" value="${t.nota === null || t.nota === undefined ? "" : notaEditable(t.nota)}" inputmode="decimal" aria-label="Nota" placeholder="—">
      <button class="boton-quitar ${tarea ? "con-tarea" : ""}" data-accion="tarea-trabajo" title="${tarea ? "Ver la tarea de esta evaluación" : "Ponerle fecha (crear tarea)"}" aria-label="Fecha de ${escapar(t.nombre)}">${ICONOS.fecha}</button>
      <button class="boton-quitar" data-accion="quitar-trabajo" title="Quitar trabajo" aria-label="Quitar ${escapar(t.nombre)}">×</button>
    </div>`;
  }).join("");

  return `
  <article class="materia ${abierta ? "abierta" : ""}" data-materia="${m.id}" style="--color-materia:${m.color};--color-estado:var(--${est})">
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
      <span class="chip-estado" data-estado="${est}">${ETIQUETA_ESTADO[est]}</span>
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
        ${m.trabajos.length ? `<div class="fila-encabezado"><span>Trabajo</span><span>%</span><span>Nota</span><span></span><span></span></div>` : ""}
        ${filas}
        <button class="agregar-trabajo" data-accion="agregar-trabajo"><span class="mas">+</span> Agregar trabajo</button>
      </div>
    </div>
  </article>`;
}

// ---------- materias (diálogo) ----------
let materiaEditando = null;
let colorElegido = COLORES[0];

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
    colorElegido = COLORES.find((c) => !usados.has(c)) || COLORES[0];
  }
  pintarColores();
  $("#dialogo-materia").showModal();
  f.nombre.focus();
}

function pintarColores() {
  $("#colores-materia").innerHTML = COLORES.map(
    (c) => `<button type="button" class="color-opcion" style="background:${c}" data-color="${c}" aria-pressed="${c === colorElegido}" aria-label="Color ${c}"></button>`
  ).join("");
}

function guardarAbiertas() {
  guardarPreferencia("abiertas", [...abiertas]);
}

export function iniciarNotas() {
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
      const nueva = { id: nuevoId(), ...valores, trabajos: [] };
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
    const s = semestre();
    const tareas = estado.datos.tareas.filter((t) => t.destino?.tipo === "materia" && t.destino.id === m.id);
    const aviso = tareas.length ? `\n\nSus ${tareas.length} tarea(s) pasan a la Bandeja de entrada.` : "";
    if (!confirm(`¿Borrar "${m.nombre}" con sus trabajos y notas?${aviso}`)) return;
    antesDeCambio();
    s.materias = s.materias.filter((x) => x.id !== m.id);
    s.horario = (s.horario || []).filter((b) => b.materiaId !== m.id);
    for (const t of tareas) { t.destino = { tipo: "bandeja" }; t.evaluacion = null; }
    guardar({ deshacible: true });
    $("#dialogo-materia").close();
    pintar();
    toast(`Borraste "${m.nombre}"`, { deshacer: true });
  });

  // Edición de trabajos en la tarjeta
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
    if (e.key !== "Enter" || !e.target.matches(".campo-celda")) return;
    e.preventDefault();
    const celdas = [...e.target.closest(".trabajos-lista").querySelectorAll(".campo-celda")];
    const i = celdas.indexOf(e.target);
    const claveSiguiente = celdas[i + 1]?.dataset.foco || "";
    e.target.blur();
    const siguiente = document.querySelector(`[data-foco="${CSS.escape(claveSiguiente)}"]`);
    (siguiente || e.target).focus();
  });

  $("#vista-notas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
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
        const t = { id: nuevoId(), nombre: `Trabajo ${m.trabajos.length + 1}`, porcentaje: sugerido, nota: null };
        m.trabajos.push(t);
        abiertas.add(m.id);
        guardarAbiertas();
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
        const tarea = tareaDeTrabajo(idT);
        if (tarea) tarea.evaluacion = null; // la tarea se conserva
        guardar({ deshacible: true });
        pintar();
        toast(`Quitaste "${t.nombre}"`, { deshacer: true });
        break;
      }
      case "tarea-trabajo": {
        const idT = b.closest("[data-trabajo]").dataset.trabajo;
        const t = m.trabajos.find((x) => x.id === idT);
        const tarea = tareaDeTrabajo(idT);
        if (tarea) abrirTareaEnDialogo({ tarea });
        else abrirTareaEnDialogo({
          valores: {
            titulo: t.nombre,
            destino: { tipo: "materia", semestreId: estado.datos.semestreActivo, id: m.id },
            evaluacion: { tipo: /parcial|examen|quiz/i.test(t.nombre) ? "parcial" : "entrega", trabajoId: t.id },
            prioridad: 2,
          },
        });
        break;
      }
    }
  });
}

export { abrirMateria };
