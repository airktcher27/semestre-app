// Pestaña Calendario: mes, semana y día, con tareas, entregas, parciales y clases.
// Las tareas se pueden arrastrar a otro día (y en semana/día, a otra hora).
import {
  estado, $, escapar, nuevoId, guardar, pintar, toast, antesDeCambio,
  semestre, buscarMateria, buscarTarea, infoDestino, trabajoDeTarea, PRIORIDADES,
  TIPOS_EVALUACION, TIPOS_CLASE, preferencia, guardarPreferencia,
} from "../nucleo.js";
import {
  hoyISO, sumarDias, inicioSemana, inicioMes, sumarMeses, deISO, diaSemana, DIAS, DIAS_CORTOS, MESES,
  MESES_CORTOS, fechaLarga, capital, horaBonita, minutosDeHora, horaDeMinutos, fechaRelativa,
} from "../fechas.js";
import { abrirTareaEnDialogo } from "../componentes/composer.js";
import { generarICS } from "../ics.js";

const HORA_INICIO = 6;
const HORA_FIN = 23;
const PX_HORA = 48;
const esCelular = () => window.matchMedia("(max-width: 760px)").matches;

let modo = preferencia("modoCalendario", null) || (esCelular() ? "dia" : "semana");
let foco = hoyISO();
let verClases = preferencia("verClases", true);

// ---------- datos por día ----------
function tareasDelDia(iso) {
  return estado.datos.tareas
    .filter((t) => t.fecha === iso)
    .sort((a, b) => (a.hecha - b.hecha) || (a.hora && b.hora ? a.hora.localeCompare(b.hora) : a.hora ? -1 : b.hora ? 1 : a.prioridad - b.prioridad));
}

function clasesDelDia(iso) {
  if (!verClases) return [];
  const d = diaSemana(iso);
  return (semestre().horario || []).filter((b) => b.dia === d && buscarMateria(b.materiaId));
}

function colorTarea(t) {
  return infoDestino(t.destino).color;
}

// ---------- pintar ----------
export function pintarCalendario() {
  for (const b of $("#cal-modo").children) b.setAttribute("aria-pressed", String(b.dataset.modo === modo));
  $("#ver-clases").checked = verClases;
  const hoy = hoyISO();
  let titulo;
  if (modo === "mes") {
    const d = deISO(foco);
    titulo = `${capital(MESES[d.getMonth()])} ${d.getFullYear()}`;
    $("#cal-cuerpo").innerHTML = htmlMes(hoy);
  } else {
    const dias = modo === "semana" ? Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana(foco), i)) : [foco];
    if (modo === "semana") {
      const a = deISO(dias[0]);
      const b = deISO(dias[6]);
      titulo = a.getMonth() === b.getMonth()
        ? `${a.getDate()} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`
        : `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`;
    } else titulo = capital(fechaLarga(foco, hoy));
    $("#cal-cuerpo").innerHTML = htmlSemana(dias, hoy);
    desplazarAHora(dias.includes(hoy));
  }
  $("#cal-titulo").textContent = titulo;
}

function htmlChip(t) {
  const tr = trabajoDeTarea(t);
  const etiqueta = tr ? `${TIPOS_EVALUACION[t.evaluacion.tipo]}: ` : "";
  return `<div class="chip-cal ${t.hecha ? "hecha" : ""} ${tr ? "evaluacion" : ""}" data-tarea="${t.id}" style="--c:${colorTarea(t)}" title="${escapar(t.titulo)}">
    <span class="punto-p" style="--p:${PRIORIDADES[t.prioridad].color}"></span>
    ${t.hora ? `<span class="hora-chip">${horaBonita(t.hora).replace(" a. m.", "a").replace(" p. m.", "p")}</span>` : ""}
    <span class="texto-chip">${escapar(etiqueta + t.titulo)}</span></div>`;
}

function htmlMes(hoy) {
  const primero = inicioMes(foco);
  const mes = primero.slice(0, 7);
  let dia = inicioSemana(primero);
  const maximo = esCelular() ? 2 : 3;
  let celdas = "";
  for (let semana = 0; semana < 6; semana++) {
    if (semana > 3 && dia.slice(0, 7) !== mes) break;
    for (let i = 0; i < 7; i++) {
      const tareas = tareasDelDia(dia);
      const visibles = tareas.slice(0, maximo);
      const resto = tareas.length - visibles.length;
      celdas += `<div class="celda-mes ${dia.slice(0, 7) !== mes ? "fuera" : ""} ${dia === hoy ? "es-hoy" : ""}" data-dia="${dia}" data-soltar="dia">
        <button class="num-dia" data-ir-dia="${dia}" aria-label="${escapar(fechaLarga(dia, hoy))}">${deISO(dia).getDate()}</button>
        ${visibles.map(htmlChip).join("")}
        ${resto > 0 ? `<button class="mas-chips" data-ir-dia="${dia}">+${resto} más</button>` : ""}
      </div>`;
      dia = sumarDias(dia, 1);
    }
  }
  return `<div class="mes">
    <div class="mes-cabeza">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="mes-grilla">${celdas}</div></div>`;
}

// Reparte en columnas los bloques que se cruzan en el tiempo.
function distribuir(items) {
  items.sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  let grupo = [];
  let finGrupo = -1;
  const cerrarGrupo = () => {
    const n = Math.max(...grupo.map((x) => x.col)) + 1;
    grupo.forEach((x) => (x.cols = n));
    grupo = [];
  };
  for (const it of items) {
    if (grupo.length && it.ini >= finGrupo) cerrarGrupo();
    const ocupadas = grupo.filter((x) => x.fin > it.ini).map((x) => x.col);
    let c = 0;
    while (ocupadas.includes(c)) c++;
    it.col = c;
    grupo.push(it);
    finGrupo = Math.max(finGrupo, it.fin);
  }
  if (grupo.length) cerrarGrupo();
  return items;
}

function htmlSemana(dias, hoy) {
  const horas = [];
  for (let h = HORA_INICIO; h <= HORA_FIN; h++) horas.push(h);
  const alto = (HORA_FIN - HORA_INICIO + 1) * PX_HORA;
  const minIni = HORA_INICIO * 60;
  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const cabeza = dias.map((d) => {
    const dd = deISO(d);
    return `<button class="sem-dia ${d === hoy ? "es-hoy" : ""}" data-ir-dia="${d}"><span>${DIAS_CORTOS[dd.getDay()]}</span><b>${dd.getDate()}</b></button>`;
  }).join("");

  const todoDia = dias.map((d) => {
    const ts = tareasDelDia(d).filter((t) => !t.hora);
    return `<div class="sem-todo-celda" data-dia="${d}" data-soltar="todo-dia">${ts.map(htmlChip).join("")}</div>`;
  }).join("");

  const columnas = dias.map((d) => {
    const items = [];
    for (const b of clasesDelDia(d)) {
      const ini = minutosDeHora(b.inicio);
      items.push({ tipo: "clase", b, ini, fin: Math.max(ini + 20, minutosDeHora(b.fin)) });
    }
    for (const t of tareasDelDia(d).filter((x) => x.hora)) {
      const ini = minutosDeHora(t.hora);
      items.push({ tipo: "tarea", t, ini, fin: ini + 45 });
    }
    distribuir(items);
    const bloques = items.map((it) => {
      const h = Math.max(20, (it.fin - it.ini) * (PX_HORA / 60) - 2);
      const top = Math.min(alto - h - 1, Math.max(0, (it.ini - minIni) * (PX_HORA / 60)));
      const izq = (100 / it.cols) * it.col;
      const ancho = 100 / it.cols;
      const pos = `top:${top}px;height:${h}px;left:calc(${izq}% + 2px);width:calc(${ancho}% - 4px)`;
      if (it.tipo === "clase") {
        const m = buscarMateria(it.b.materiaId);
        return `<div class="bloque-clase" data-clase="${it.b.id}" style="${pos};--c:${m.color}" title="${escapar(m.nombre)}">
          <b>${escapar(m.nombre)}</b><span>${horaBonita(it.b.inicio)} – ${horaBonita(it.b.fin)}${it.b.salon ? ` · ${escapar(it.b.salon)}` : ""}${it.b.tipo && it.b.tipo !== "clase" ? ` · ${TIPOS_CLASE[it.b.tipo]}` : ""}</span></div>`;
      }
      const t = it.t;
      const tr = trabajoDeTarea(t);
      return `<div class="bloque-tarea chip-cal ${t.hecha ? "hecha" : ""} ${tr ? "evaluacion" : ""}" data-tarea="${t.id}" style="${pos};--c:${colorTarea(t)}">
        <span class="punto-p" style="--p:${PRIORIDADES[t.prioridad].color}"></span><span class="texto-chip"><b>${horaBonita(t.hora)}</b> ${escapar((tr ? `${TIPOS_EVALUACION[t.evaluacion.tipo]}: ` : "") + t.titulo)}</span></div>`;
    }).join("");
    const linea = d === hoy && minAhora >= minIni && minAhora <= (HORA_FIN + 1) * 60
      ? `<div class="linea-ahora" style="top:${(minAhora - minIni) * (PX_HORA / 60)}px"></div>` : "";
    return `<div class="sem-col ${d === hoy ? "es-hoy" : ""}" data-dia="${d}" data-col data-soltar="hora" style="height:${alto}px">${bloques}${linea}</div>`;
  }).join("");

  return `<div class="semana" style="--dias:${dias.length}">
    <div class="sem-fila sem-cabeza"><div class="sem-medianil"></div>${cabeza}</div>
    <div class="sem-fila sem-todo"><div class="sem-medianil etiqueta-todo">Todo<br>el día</div>${todoDia}</div>
    <div class="sem-scroll" id="sem-scroll">
      <div class="sem-fila sem-cuerpo">
        <div class="sem-medianil sem-horas" style="height:${alto}px">${horas.map((h) => `<span style="top:${(h - HORA_INICIO) * PX_HORA}px">${horaBonita(`${String(h).padStart(2, "0")}:00`)}</span>`).join("")}</div>
        ${columnas}
      </div>
    </div>
  </div>`;
}

function desplazarAHora(incluyeHoy) {
  const sc = $("#sem-scroll");
  if (!sc) return;
  const ahora = new Date();
  const h = incluyeHoy ? Math.max(HORA_INICIO, ahora.getHours() - 1) : 7;
  sc.scrollTop = (h - HORA_INICIO) * PX_HORA;
}

// ---------- arrastrar ----------
let arrastre = null;
let ignorarClic = false;

function iniciarArrastre() {
  const cuerpo = $("#cal-cuerpo");
  cuerpo.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-tarea]");
    if (!el || e.button > 0) return;
    arrastre = { el, id: el.dataset.tarea, x: e.clientX, y: e.clientY, activo: false, tipo: e.pointerType, inicio: Date.now(), fantasma: null, pid: e.pointerId };
    if (e.pointerType !== "mouse") {
      arrastre.temporizador = setTimeout(() => arrastre && activar(e.clientX, e.clientY), 280);
    }
  });

  const activar = (x, y) => {
    arrastre.activo = true;
    const r = arrastre.el.getBoundingClientRect();
    const f = arrastre.el.cloneNode(true);
    f.classList.add("arrastre-fantasma");
    f.style.width = `${Math.min(r.width, 220)}px`;
    f.style.height = "auto";
    f.style.left = `${x - 20}px`;
    f.style.top = `${y - 14}px`;
    document.body.append(f);
    arrastre.fantasma = f;
    arrastre.el.classList.add("arrastrando");
    navigator.vibrate?.(15);
  };

  window.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (!arrastre.activo) {
      if (arrastre.tipo === "mouse" && Math.hypot(dx, dy) > 6) activar(e.clientX, e.clientY);
      else if (arrastre.tipo !== "mouse" && Math.hypot(dx, dy) > 10) { clearTimeout(arrastre.temporizador); arrastre = null; }
      return;
    }
    e.preventDefault();
    arrastre.fantasma.style.left = `${e.clientX - 20}px`;
    arrastre.fantasma.style.top = `${e.clientY - 14}px`;
    document.querySelectorAll(".soltar-aqui").forEach((x) => x.classList.remove("soltar-aqui"));
    destinoEn(e.clientX, e.clientY)?.el.classList.add("soltar-aqui");
  }, { passive: false });

  const terminar = (e) => {
    if (!arrastre) return;
    clearTimeout(arrastre.temporizador);
    const a = arrastre;
    arrastre = null;
    if (!a.activo) return;
    ignorarClic = true;
    setTimeout(() => (ignorarClic = false), 50);
    a.fantasma.remove();
    a.el.classList.remove("arrastrando");
    document.querySelectorAll(".soltar-aqui").forEach((x) => x.classList.remove("soltar-aqui"));
    if (e.type === "pointercancel") return;
    const dest = destinoEn(e.clientX, e.clientY);
    const t = buscarTarea(a.id);
    if (!dest || !t) return;
    const antes = `${t.fecha}|${t.hora}`;
    antesDeCambio();
    t.fecha = dest.fecha;
    if (dest.tipo === "hora") t.hora = dest.hora;
    if (dest.tipo === "todo-dia") t.hora = null;
    if (`${t.fecha}|${t.hora}` === antes) return;
    guardar({ deshacible: true });
    pintar();
    toast(`Movida a ${fechaRelativa(t.fecha)}${t.hora ? `, ${horaBonita(t.hora)}` : ""}`, { deshacer: true });
  };
  window.addEventListener("pointerup", terminar);
  window.addEventListener("pointercancel", terminar);
  // En el celular, mientras se arrastra, que no se desplace la página.
  window.addEventListener("touchmove", (e) => { if (arrastre?.activo) e.preventDefault(); }, { passive: false });
}

function destinoEn(x, y) {
  const el = document.elementFromPoint(x, y)?.closest("[data-soltar]");
  if (!el) return null;
  const fecha = el.dataset.dia;
  if (el.dataset.soltar === "hora") {
    const r = el.getBoundingClientRect();
    const min = HORA_INICIO * 60 + ((y - r.top) / PX_HORA) * 60;
    return { el, tipo: "hora", fecha, hora: horaDeMinutos(Math.round(min / 15) * 15) };
  }
  return { el, tipo: el.dataset.soltar, fecha };
}

// ---------- horario de clases ----------
let bloqueEditando = null;

function abrirHorario(idBloque = null) {
  pintarHorario();
  editarBloque(idBloque);
  $("#dialogo-horario").showModal();
}

function pintarHorario() {
  const s = semestre();
  const bloques = (s.horario || []).filter((b) => buscarMateria(b.materiaId))
    .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || a.inicio.localeCompare(b.inicio));
  $("#titulo-horario").textContent = `Horario · ${s.nombre}`;
  $("#lista-horario").innerHTML = bloques.length
    ? bloques.map((b) => {
      const m = buscarMateria(b.materiaId);
      return `<button type="button" class="fila-horario ${b.id === bloqueEditando ? "editando" : ""}" data-bloque="${b.id}">
        <span class="dia-h">${capital(DIAS[b.dia]).slice(0, 3)}</span>
        <span class="hora-h">${horaBonita(b.inicio)} – ${horaBonita(b.fin)}</span>
        <span class="materia-h"><span class="simbolo" style="color:${m.color}">●</span> ${escapar(m.nombre)}${b.tipo && b.tipo !== "clase" ? ` · ${TIPOS_CLASE[b.tipo]}` : ""}</span>
        <span class="salon-h">${escapar(b.salon || "")}</span></button>`;
    }).join("")
    : `<p class="info-sync">Aún no hay clases. Agrega la primera abajo.</p>`;
  const f = $("#form-bloque");
  f.materia.innerHTML = s.materias.map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join("");
  $("#form-bloque").classList.toggle("oculto", s.materias.length === 0);
  $("#sin-materias-horario").classList.toggle("oculto", s.materias.length > 0);
}

function editarBloque(id) {
  bloqueEditando = id;
  const f = $("#form-bloque");
  const b = id ? semestre().horario.find((x) => x.id === id) : null;
  $("#error-bloque").textContent = "";
  if (b) {
    f.materia.value = b.materiaId;
    f.dia.value = String(b.dia);
    f.inicio.value = b.inicio;
    f.fin.value = b.fin;
    f.tipo.value = b.tipo || "clase";
    f.salon.value = b.salon || "";
  } else {
    f.dia.value = "1";
    f.inicio.value = "07:00";
    f.fin.value = "09:00";
    f.tipo.value = "clase";
    f.salon.value = "";
  }
  $("#titulo-form-bloque").textContent = b ? "Editar clase" : "Agregar clase";
  $("#boton-guardar-bloque").textContent = b ? "Guardar cambios" : "Agregar";
  $("#boton-borrar-bloque").classList.toggle("oculto", !b);
  $("#boton-nuevo-bloque").classList.toggle("oculto", !b);
  document.querySelectorAll(".fila-horario").forEach((x) => x.classList.toggle("editando", x.dataset.bloque === id));
}

// ---------- exportar ----------
export function exportarICS({ incluirClases = true } = {}) {
  const d = estado.datos;
  const tareas = d.tareas.filter((t) => !t.hecha && t.fecha).map((t) => {
    const tr = trabajoDeTarea(t);
    const info = infoDestino(t.destino);
    return {
      id: t.id, titulo: tr ? `${TIPOS_EVALUACION[t.evaluacion.tipo]}: ${t.titulo}` : t.titulo,
      fecha: t.fecha, hora: t.hora, recordatorio: t.recordatorio, descripcion: t.descripcion,
      etiqueta: t.destino?.tipo === "bandeja" ? "" : info.nombre,
    };
  });
  const clases = incluirClases ? (semestre().horario || []).filter((b) => buscarMateria(b.materiaId)).map((b) => {
    const m = buscarMateria(b.materiaId);
    return { id: b.id, titulo: m.nombre + (b.tipo && b.tipo !== "clase" ? ` (${TIPOS_CLASE[b.tipo]})` : ""), dia: b.dia, inicio: b.inicio, fin: b.fin, lugar: b.salon };
  }) : [];
  const texto = generarICS({ tareas, clases, desde: inicioSemana(hoyISO()) });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/calendar;charset=utf-8" }));
  a.download = `semestre-${hoyISO()}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exporté ${tareas.length} tarea(s)${clases.length ? ` y ${clases.length} clase(s)` : ""}. Ábrelo con tu calendario.`);
}

// ---------- eventos ----------
export function iniciarCalendario() {
  iniciarArrastre();

  $("#cal-modo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-modo]");
    if (!b) return;
    modo = b.dataset.modo;
    guardarPreferencia("modoCalendario", modo);
    pintarCalendario();
  });

  $("#ver-clases").addEventListener("change", (e) => {
    verClases = e.target.checked;
    guardarPreferencia("verClases", verClases);
    pintarCalendario();
  });

  $("#vista-calendario").addEventListener("click", (e) => {
    if (ignorarClic) return;
    const nav = e.target.closest("[data-cal]");
    if (nav) {
      const paso = nav.dataset.cal;
      if (paso === "hoy") foco = hoyISO();
      else {
        const n = paso === "prev" ? -1 : 1;
        foco = modo === "mes" ? sumarMeses(foco, n) : sumarDias(foco, modo === "semana" ? 7 * n : n);
      }
      pintarCalendario();
      return;
    }
    if (e.target.closest("#boton-horario")) { abrirHorario(); return; }
    if (e.target.closest("#boton-ics")) { exportarICS(); return; }

    const ir = e.target.closest("[data-ir-dia]");
    if (ir) {
      foco = ir.dataset.irDia;
      modo = "dia";
      guardarPreferencia("modoCalendario", modo);
      pintarCalendario();
      return;
    }
    const chip = e.target.closest("[data-tarea]");
    if (chip) { abrirTareaEnDialogo({ tarea: buscarTarea(chip.dataset.tarea) }); return; }
    const clase = e.target.closest("[data-clase]");
    if (clase) { abrirHorario(clase.dataset.clase); return; }

    const zona = e.target.closest("[data-soltar]");
    if (zona) {
      const dest = destinoEn(e.clientX, e.clientY);
      const valores = { fecha: zona.dataset.dia };
      if (dest?.tipo === "hora") valores.hora = horaDeMinutos(Math.floor(minutosDeHora(dest.hora) / 30) * 30);
      abrirTareaEnDialogo({ valores });
    }
  });

  // Horario
  $("#lista-horario").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bloque]");
    if (b) editarBloque(b.dataset.bloque);
  });
  $("#boton-nuevo-bloque").addEventListener("click", () => editarBloque(null));
  $("#form-bloque").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.inicio.value || !f.fin.value || f.fin.value <= f.inicio.value) {
      $("#error-bloque").textContent = "La hora de fin debe ser después de la de inicio.";
      return;
    }
    const s = semestre();
    s.horario ||= [];
    const valores = { materiaId: f.materia.value, dia: Number(f.dia.value), inicio: f.inicio.value, fin: f.fin.value, tipo: f.tipo.value, salon: f.salon.value.trim() };
    if (bloqueEditando) Object.assign(s.horario.find((x) => x.id === bloqueEditando), valores);
    else s.horario.push({ id: nuevoId(), ...valores });
    guardar();
    pintar();
    pintarHorario();
    const siguiente = { ...valores };
    editarBloque(null);
    // Deja la misma materia elegida para agregar rápido el siguiente bloque.
    f.materia.value = siguiente.materiaId;
    toast("Horario guardado");
  });
  $("#boton-borrar-bloque").addEventListener("click", () => {
    const s = semestre();
    antesDeCambio();
    s.horario = s.horario.filter((x) => x.id !== bloqueEditando);
    guardar({ deshacible: true });
    pintar();
    pintarHorario();
    editarBloque(null);
    toast("Clase quitada del horario", { deshacer: true });
  });
}
