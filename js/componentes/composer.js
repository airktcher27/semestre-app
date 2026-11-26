// Editor de tareas (para crear y para editar), como el de Todoist:
// nombre, descripción y botones de Fecha · Prioridad · Recordatorios · Destino · Evaluación.
import {
  estado, escapar, clonar, guardar, pintar, toast, antesDeCambio,
  PRIORIDADES, RECORDATORIOS, TIPOS_EVALUACION, textoRecordatorio,
  semestre, buscarMateria, infoDestino, trabajoDeTarea, nuevaTarea, buscarTarea,
} from "../nucleo.js";
import {
  hoyISO, atajos, interpretarFecha, fechaRelativa, fechaLarga, horaBonita, DIAS_CORTOS,
  diaSemana, fechaCorta, inicioMes, sumarMeses, sumarDias, inicioSemana, MESES, deISO,
} from "../fechas.js";
import { abrirPopover, cerrarPopover } from "./popover.js";
import { formatoNota, formatoPorcentaje, interpretarNota } from "../calculos.js";
import { pedirPermisoNotificaciones } from "../recordatorios.js";

const BANDERA = (color) =>
  `<svg class="bandera" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 14V2.5M3 2.5h8.5l-1.8 3 1.8 3H3" fill="${color === "var(--texto-3)" ? "none" : color}" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const ICONOS = {
  fecha: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.3"/></svg>`,
  alarma: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 6.5V9l1.8 1.2M2.5 3.5l2-1.5M13.5 3.5l-2-1.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`,
  nota: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 13.5h10M4 10.5l6.5-6.5 2 2L6 12.5H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  evaluacion: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 2h6l3 3v9H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 9l1.3 1.3L10.5 7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};
export { BANDERA, ICONOS };

// Destinos posibles: bandeja, listas propias y materias del semestre activo.
function opcionesDestino() {
  const d = estado.datos;
  const s = semestre();
  return [
    { destino: { tipo: "bandeja" }, ...infoDestino({ tipo: "bandeja" }), grupo: "" },
    ...d.listas.map((l) => ({ destino: { tipo: "lista", id: l.id }, nombre: l.nombre, color: l.color, simbolo: "#", grupo: "Mis listas" })),
    ...s.materias.map((m) => ({ destino: { tipo: "materia", semestreId: s.id, id: m.id }, nombre: m.nombre, color: m.color, simbolo: "●", grupo: `Materias ${s.nombre}` })),
  ];
}

/**
 * crearComposer({ tarea, valores, alTerminar, permitirBorrar })
 *  - tarea: tarea existente para editar (o null para crear)
 *  - valores: valores iniciales al crear (fecha, destino, evaluacion…)
 *  - alTerminar(resultado): "guardada" | "cancelada" | "borrada"
 */
export function crearComposer({ tarea = null, valores = {}, alTerminar = () => {}, enDialogo = false } = {}) {
  const esNueva = !tarea;
  const t = esNueva ? nuevaTarea(valores) : clonar(tarea);
  const trabajoInicial = trabajoDeTarea(t);
  let notaPendiente; // undefined = no se tocó

  const form = document.createElement("form");
  form.className = `composer ${enDialogo ? "en-dialogo" : ""}`;
  form.noValidate = true;
  form.innerHTML = `
    <input class="composer-titulo" name="titulo" placeholder="Nombre de la tarea" autocomplete="off" maxlength="200" value="${escapar(t.titulo)}">
    <textarea class="composer-desc" name="descripcion" placeholder="Descripción" rows="1" maxlength="2000">${escapar(t.descripcion)}</textarea>
    <div class="composer-chips"></div>
    <div class="composer-pie">
      <button type="button" class="chip chip-destino" data-pop="destino"></button>
      <span class="espaciador"></span>
      ${esNueva ? "" : `<button type="button" class="boton fantasma peligro" data-borrar>Borrar</button>`}
      <button type="button" class="boton" data-cancelar>Cancelar</button>
      <button type="submit" class="boton primario" data-enviar>${esNueva ? "Añadir tarea" : "Guardar"}</button>
    </div>`;

  const titulo = form.querySelector(".composer-titulo");
  const desc = form.querySelector(".composer-desc");
  const enviar = form.querySelector("[data-enviar]");
  const ajustarDesc = () => {
    desc.style.height = "auto";
    desc.style.height = `${Math.min(desc.scrollHeight, 180)}px`;
  };
  desc.addEventListener("input", ajustarDesc);
  titulo.addEventListener("input", () => (enviar.disabled = !titulo.value.trim()));
  enviar.disabled = !t.titulo.trim();

  function pintarChips() {
    const hoy = hoyISO();
    const chips = [];
    // Fecha
    let textoFecha = "Fecha";
    let claseFecha = "";
    if (t.fecha) {
      textoFecha = fechaRelativa(t.fecha, hoy) + (t.hora ? ` ${horaBonita(t.hora)}` : "");
      claseFecha = t.fecha < hoy ? "vencida" : t.fecha === hoy ? "hoy" : "";
    }
    chips.push(`<button type="button" class="chip ${t.fecha ? "activo" : ""} ${claseFecha}" data-pop="fecha">${ICONOS.fecha}<span>${escapar(textoFecha)}</span>${
      t.fecha ? `<span class="chip-quitar" data-quitar="fecha" title="Quitar fecha">×</span>` : ""}</button>`);
    // Prioridad
    const p = PRIORIDADES[t.prioridad];
    chips.push(`<button type="button" class="chip ${t.prioridad < 4 ? "activo" : ""}" data-pop="prioridad">${BANDERA(p.color)}<span>${t.prioridad < 4 ? `P${t.prioridad}` : "Prioridad"}</span></button>`);
    // Recordatorio
    chips.push(`<button type="button" class="chip ${t.recordatorio !== null ? "activo" : ""}" data-pop="recordatorio">${ICONOS.alarma}<span>${
      t.recordatorio !== null ? escapar(textoRecordatorio(t.recordatorio)) : "Recordatorios"}</span></button>`);
    // Evaluación (solo si la tarea es de una materia)
    if (t.destino.tipo === "materia") {
      const tr = evaluacionActual();
      chips.push(`<button type="button" class="chip ${tr ? "activo evaluacion" : ""}" data-pop="evaluacion">${ICONOS.evaluacion}<span>${
        tr ? `${TIPOS_EVALUACION[t.evaluacion.tipo]} · ${escapar(tr.nombre)} (${formatoPorcentaje(tr.porcentaje)})` : "¿Es una evaluación?"}</span></button>`);
      if (tr) {
        const nota = notaPendiente !== undefined ? notaPendiente : tr.nota;
        chips.push(`<button type="button" class="chip ${nota !== null && nota !== undefined ? "activo" : ""}" data-pop="nota">${ICONOS.nota}<span>${
          nota !== null && nota !== undefined ? `Nota ${formatoNota(nota, 1)}` : "Poner nota"}</span></button>`);
      }
    }
    form.querySelector(".composer-chips").innerHTML = chips.join("");
    const info = infoDestino(t.destino);
    form.querySelector(".chip-destino").innerHTML = `<span class="simbolo" style="color:${info.color}">${info.simbolo}</span><span>${escapar(info.nombre)}</span><span class="flechita">▾</span>`;
  }

  function evaluacionActual() {
    if (!t.evaluacion || t.destino.tipo !== "materia") return null;
    const m = buscarMateria(t.destino.id, t.destino.semestreId);
    return m?.trabajos.find((x) => x.id === t.evaluacion.trabajoId) || null;
  }

  // ----- menús -----
  const menus = {
    fecha(pop, cerrar, reubicar) {
      const hoy = hoyISO();
      let mesVisible = inicioMes(t.fecha || hoy);
      const etiquetaAtajo = (a) => {
        if (a.id === "proxima") return `${DIAS_CORTOS[diaSemana(a.fecha)]} ${fechaCorta(a.fecha, hoy)}`;
        return DIAS_CORTOS[diaSemana(a.fecha)];
      };
      const ICON_ATAJO = { hoy: "📅", manana: "☀️", finde: "🛋️", proxima: "➡️" };
      pop.innerHTML = `
        <input class="pop-entrada" placeholder="Escribe una fecha" aria-label="Escribe una fecha (ej. viernes, 15 dic, mañana 3pm)">
        <div class="pop-vista-previa"></div>
        <div class="pop-lista">
          ${atajos(hoy).map((a) => `<button type="button" class="pop-opcion" data-fecha="${a.fecha}"><span class="icono-atajo">${ICON_ATAJO[a.id]}</span><span>${a.texto}</span><span class="derecha">${etiquetaAtajo(a)}</span></button>`).join("")}
          ${t.fecha ? `<button type="button" class="pop-opcion" data-fecha=""><span class="icono-atajo">⊘</span><span>Sin fecha</span></button>` : ""}
        </div>
        <div class="mini-cal"></div>
        <div class="pop-hora">
          <label>Hora <input type="time" step="300" value="${t.hora || ""}"></label>
          ${t.hora ? `<button type="button" class="boton fantasma" data-sin-hora>Quitar hora</button>` : ""}
        </div>`;
      const entrada = pop.querySelector(".pop-entrada");
      const previa = pop.querySelector(".pop-vista-previa");
      const pintarCal = () => {
        const d = deISO(mesVisible);
        let celdas = "";
        let dia = inicioSemana(mesVisible);
        for (let i = 0; i < 42; i++) {
          const fuera = dia.slice(0, 7) !== mesVisible.slice(0, 7);
          celdas += `<button type="button" data-fecha="${dia}" class="${fuera ? "fuera" : ""} ${dia === hoy ? "es-hoy" : ""} ${dia === t.fecha ? "elegido" : ""} ${dia < hoy ? "pasado" : ""}">${deISO(dia).getDate()}</button>`;
          dia = sumarDias(dia, 1);
          if (i === 34 && dia.slice(0, 7) !== mesVisible.slice(0, 7)) break;
        }
        pop.querySelector(".mini-cal").innerHTML = `
          <div class="mini-cal-cabeza"><b>${MESES[d.getMonth()]} ${d.getFullYear()}</b>
            <span><button type="button" data-mes="-1" aria-label="Mes anterior">‹</button><button type="button" data-mes="1" aria-label="Mes siguiente">›</button></span></div>
          <div class="mini-cal-dias">${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span>${x}</span>`).join("")}</div>
          <div class="mini-cal-grilla">${celdas}</div>`;
        reubicar?.();
      };
      pintarCal();
      entrada.addEventListener("input", () => {
        const r = interpretarFecha(entrada.value, hoy);
        previa.textContent = entrada.value.trim() ? (r ? `→ ${fechaLarga(r.fecha, hoy)}${r.hora ? `, ${horaBonita(r.hora)}` : ""}` : "No entiendo esa fecha") : "";
        previa.classList.toggle("error", !!entrada.value.trim() && !r);
      });
      entrada.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const r = interpretarFecha(entrada.value, hoy);
        if (!r) return;
        t.fecha = r.fecha;
        if (r.hora) t.hora = r.hora;
        cerrar();
        pintarChips();
        titulo.focus();
      });
      pop.addEventListener("click", (e) => {
        const mes = e.target.closest("[data-mes]");
        if (mes) {
          mesVisible = sumarMeses(mesVisible, Number(mes.dataset.mes));
          pintarCal();
          return;
        }
        if (e.target.closest("[data-sin-hora]")) {
          t.hora = null;
          cerrar();
          pintarChips();
          return;
        }
        const b = e.target.closest("[data-fecha]");
        if (!b) return;
        t.fecha = b.dataset.fecha || null;
        if (!t.fecha) { t.hora = null; }
        cerrar();
        pintarChips();
        titulo.focus();
      });
      pop.querySelector('input[type="time"]').addEventListener("change", (e) => {
        t.hora = e.target.value || null;
        if (t.hora && !t.fecha) t.fecha = hoy;
        pintarChips();
      });
      setTimeout(() => entrada.focus(), 0);
    },

    prioridad(pop, cerrar) {
      pop.innerHTML = `<div class="pop-lista">${[1, 2, 3, 4].map((n) =>
        `<button type="button" class="pop-opcion ${t.prioridad === n ? "elegida" : ""}" data-p="${n}">${BANDERA(PRIORIDADES[n].color)}<span>${PRIORIDADES[n].nombre}</span>${t.prioridad === n ? `<span class="derecha">✓</span>` : ""}</button>`).join("")}</div>`;
      pop.addEventListener("click", (e) => {
        const b = e.target.closest("[data-p]");
        if (!b) return;
        t.prioridad = Number(b.dataset.p);
        cerrar();
        pintarChips();
      });
    },

    recordatorio(pop, cerrar) {
      pop.innerHTML = `<div class="pop-lista">
        ${RECORDATORIOS.map((r) => `<button type="button" class="pop-opcion ${t.recordatorio === r.valor ? "elegida" : ""}" data-r="${r.valor}">${ICONOS.alarma}<span>${r.texto}</span>${t.recordatorio === r.valor ? `<span class="derecha">✓</span>` : ""}</button>`).join("")}
        ${t.recordatorio !== null ? `<button type="button" class="pop-opcion" data-r=""><span class="icono-atajo">⊘</span><span>Sin recordatorio</span></button>` : ""}
        </div>
        <p class="pop-nota">${!t.fecha ? "La tarea no tiene fecha: al elegir un recordatorio se pone para hoy." : !t.hora ? "Sin hora, el aviso se calcula desde las 8:00 a. m. de ese día." : `Con base en ${horaBonita(t.hora)}.`}
        Los avisos llegan con la app abierta o instalada; para avisos seguros, exporta al calendario del celular.</p>`;
      pop.addEventListener("click", (e) => {
        const b = e.target.closest("[data-r]");
        if (!b) return;
        t.recordatorio = b.dataset.r === "" ? null : Number(b.dataset.r);
        if (t.recordatorio !== null && !t.fecha) t.fecha = hoyISO();
        if (t.recordatorio !== null) pedirPermisoNotificaciones();
        cerrar();
        pintarChips();
      });
    },

    destino(pop, cerrar, reubicar) {
      const ops = opcionesDestino();
      pop.innerHTML = `<input class="pop-entrada" placeholder="Buscar lista o materia"><div class="pop-lista"></div>`;
      const lista = pop.querySelector(".pop-lista");
      const pintarOps = (filtro = "") => {
        const f = filtro.toLowerCase();
        let grupo = null;
        lista.innerHTML = ops.filter((o) => o.nombre.toLowerCase().includes(f)).map((o, i) => {
          const elegida = JSON.stringify(o.destino) === JSON.stringify(t.destino);
          const cab = o.grupo !== grupo ? ((grupo = o.grupo) ? `<div class="pop-grupo">${escapar(o.grupo)}</div>` : "") : "";
          return `${cab}<button type="button" class="pop-opcion ${elegida ? "elegida" : ""}" data-i="${ops.indexOf(o)}"><span class="simbolo" style="color:${o.color}">${o.simbolo}</span><span>${escapar(o.nombre)}</span>${elegida ? `<span class="derecha">✓</span>` : ""}</button>`;
        }).join("") || `<p class="pop-nota">Nada coincide.</p>`;
        reubicar?.();
      };
      pintarOps();
      const entrada = pop.querySelector(".pop-entrada");
      entrada.addEventListener("input", () => pintarOps(entrada.value));
      entrada.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); lista.querySelector("[data-i]")?.click(); }
      });
      lista.addEventListener("click", (e) => {
        const b = e.target.closest("[data-i]");
        if (!b) return;
        const nuevo = ops[Number(b.dataset.i)].destino;
        if (JSON.stringify(nuevo) !== JSON.stringify(t.destino)) t.evaluacion = null;
        t.destino = nuevo;
        cerrar();
        pintarChips();
      });
      setTimeout(() => entrada.focus(), 0);
    },

    evaluacion(pop, cerrar) {
      const m = buscarMateria(t.destino.id, t.destino.semestreId);
      const tipo = t.evaluacion?.tipo || "entrega";
      const trabajos = m?.trabajos || [];
      pop.innerHTML = `
        <div class="segmentado pequeno" style="margin:4px 4px 8px">
          ${Object.entries(TIPOS_EVALUACION).map(([k, v]) => `<button type="button" data-tipo="${k}" aria-pressed="${tipo === k}">${v}</button>`).join("")}
        </div>
        <div class="pop-grupo">¿Qué trabajo de ${escapar(m?.nombre || "la materia")} es?</div>
        <div class="pop-lista">
          ${trabajos.map((tr) => {
            const otra = estado.datos.tareas.find((x) => x.id !== t.id && x.evaluacion?.trabajoId === tr.id);
            const elegido = t.evaluacion?.trabajoId === tr.id;
            return `<button type="button" class="pop-opcion ${elegido ? "elegida" : ""}" data-trabajo="${tr.id}"><span>${escapar(tr.nombre)}</span><span class="derecha">${formatoPorcentaje(tr.porcentaje)}${otra ? " · ya tiene tarea" : ""}${elegido ? " ✓" : ""}</span></button>`;
          }).join("") || `<p class="pop-nota">Esta materia aún no tiene trabajos. Agrégalos en la pestaña Notas.</p>`}
          ${t.evaluacion ? `<button type="button" class="pop-opcion" data-trabajo=""><span class="icono-atajo">⊘</span><span>No es una evaluación</span></button>` : ""}
        </div>`;
      let tipoElegido = tipo;
      pop.addEventListener("click", (e) => {
        const bt = e.target.closest("[data-tipo]");
        if (bt) {
          tipoElegido = bt.dataset.tipo;
          pop.querySelectorAll("[data-tipo]").forEach((x) => x.setAttribute("aria-pressed", String(x === bt)));
          if (t.evaluacion) { t.evaluacion.tipo = tipoElegido; pintarChips(); }
          return;
        }
        const b = e.target.closest("[data-trabajo]");
        if (!b) return;
        if (b.dataset.trabajo === "") t.evaluacion = null;
        else {
          t.evaluacion = { tipo: tipoElegido, trabajoId: b.dataset.trabajo };
          const tr = trabajos.find((x) => x.id === b.dataset.trabajo);
          if (!titulo.value.trim() && tr) { titulo.value = tr.nombre; enviar.disabled = false; }
        }
        notaPendiente = undefined;
        cerrar();
        pintarChips();
      });
    },

    nota(pop, cerrar) {
      const tr = evaluacionActual();
      const actual = notaPendiente !== undefined ? notaPendiente : tr?.nota;
      pop.innerHTML = `
        <label class="campo" style="margin:4px"><span>Nota de ${escapar(tr?.nombre || "")} (0 a 5)</span>
          <input class="pop-entrada" inputmode="decimal" value="${actual === null || actual === undefined ? "" : String(actual).replace(".", ",")}" placeholder="Ej. 4,2"></label>
        <p class="pop-nota">Se guarda también en la pestaña Notas. Déjala vacía si aún no la tienes.</p>`;
      const entrada = pop.querySelector("input");
      const aplicar = () => {
        const r = interpretarNota(entrada.value);
        if (!r.ok) { entrada.classList.add("invalido"); return false; }
        notaPendiente = r.valor;
        pintarChips();
        return true;
      };
      entrada.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); if (aplicar()) cerrar(); }
      });
      entrada.addEventListener("change", aplicar);
      setTimeout(() => { entrada.focus(); entrada.select(); }, 0);
    },
  };

  form.addEventListener("click", (e) => {
    const quitar = e.target.closest("[data-quitar]");
    if (quitar) {
      e.preventDefault();
      if (quitar.dataset.quitar === "fecha") { t.fecha = null; t.hora = null; }
      pintarChips();
      return;
    }
    const b = e.target.closest("[data-pop]");
    if (b) {
      abrirPopover(b, menus[b.dataset.pop], { ancho: b.dataset.pop === "fecha" ? 270 : b.dataset.pop === "evaluacion" ? 300 : 250 });
      return;
    }
    if (e.target.closest("[data-cancelar]")) { cerrarPopover(); alTerminar("cancelada"); }
    if (e.target.closest("[data-borrar]")) {
      cerrarPopover();
      antesDeCambio();
      estado.datos.tareas = estado.datos.tareas.filter((x) => x.id !== t.id);
      guardar({ deshacible: true });
      alTerminar("borrada");
      pintar();
      toast(`Borraste "${tarea.titulo}"`, { deshacer: true });
    }
  });

  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector(".popover")) { e.preventDefault(); alTerminar("cancelada"); }
    if (e.key === "Enter" && e.target === titulo) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = titulo.value.trim();
    if (!nombre) { titulo.focus(); return; }
    t.titulo = nombre;
    t.descripcion = desc.value.trim();
    cerrarPopover();
    aplicarTarea(t, { esNueva, notaPendiente, trabajoInicial });
    alTerminar("guardada", t);
  });

  pintarChips();
  setTimeout(ajustarDesc, 0);
  form.enfocar = () => { titulo.focus(); titulo.setSelectionRange(titulo.value.length, titulo.value.length); };
  return form;
}

// Guarda la tarea y mantiene sincronizado el enlace con el trabajo de la materia.
export function aplicarTarea(t, { esNueva, notaPendiente } = {}) {
  const d = estado.datos;
  if (t.evaluacion) {
    // Un trabajo solo puede estar ligado a una tarea.
    for (const otra of d.tareas) if (otra.id !== t.id && otra.evaluacion?.trabajoId === t.evaluacion.trabajoId) otra.evaluacion = null;
    const tr = trabajoDeTarea(t);
    if (tr && notaPendiente !== undefined) tr.nota = notaPendiente;
  }
  if (esNueva) d.tareas.push(t);
  else {
    const i = d.tareas.findIndex((x) => x.id === t.id);
    if (i >= 0) {
      t.hecha = d.tareas[i].hecha; // por si se marcó mientras se editaba
      t.hechaEn = d.tareas[i].hechaEn;
      d.tareas[i] = t;
    } else d.tareas.push(t);
  }
  guardar();
  pintar();
  if (esNueva) toast(`Tarea añadida${t.fecha ? ` · ${fechaRelativa(t.fecha)}` : ""}`);
}

// ---------- diálogo con el editor (para Calendario y Notas) ----------
export function abrirTareaEnDialogo({ tarea = null, valores = {} } = {}) {
  const dlg = document.getElementById("dialogo-tarea");
  const cuerpo = dlg.querySelector(".dialogo-tarea-cuerpo");
  cuerpo.innerHTML = "";
  const c = crearComposer({
    tarea: tarea ? buscarTarea(tarea.id) || tarea : null,
    valores,
    enDialogo: true,
    alTerminar: () => dlg.close(),
  });
  cuerpo.append(c);
  dlg.showModal();
  c.enfocar();
}
