// Pestaña Notas → Historial: semestres anteriores, PA, PAPA y créditos.
import {
  estado, $, escapar, nuevoId, guardar, pintar, toast, antesDeCambio, COLORES,
} from "../nucleo.js";
import {
  historial, papaConEnCurso, ordenarSemestres, formatoNota, interpretarNota, estadoMateria,
} from "../calculos.js";

const ETIQUETA = { aprobada: "Aprobada", reprobada: "Reprobada", "en-curso": "En curso", cancelada: "Cancelada" };

export function pintarHistorial() {
  const d = estado.datos;
  const aprob = d.ajustes.notaAprobacion;
  const h = historial(d.semestres, aprob);
  const proyectado = h.materiasEnCurso ? papaConEnCurso(d.semestres, aprob) : null;
  const color = (n) => (n === null ? "" : `color:var(--${estadoMateria({ promedioEvaluado: n }, aprob)})`);

  const alerta = h.papa !== null && h.papa < 3.0 - 1e-9
    ? `<div class="aviso alerta"><p>Tu PAPA está por debajo de 3,0. Según el Estatuto Estudiantil (art. 44 del Acuerdo 008 de 2008), con un PAPA menor a 3,0 se pierde la calidad de estudiante de pregrado. Vale la pena hablarlo con tu coordinación curricular.</p></div>`
    : "";

  $("#vista-historial").innerHTML = `
    ${alerta}
    <section class="resumen resumen-4">
      <div class="tarjeta-dato destacada">
        <div class="etiqueta">PAPA</div>
        <div class="valor" style="${color(h.papa)}">${formatoNota(h.papa)}</div>
        <div class="detalle">Todas las notas definitivas, incluidas repetidas y perdidas</div>
      </div>
      <div class="tarjeta-dato"><div class="etiqueta">PA</div><div class="valor">${formatoNota(h.pa)}</div>
        <div class="detalle">Solo la última nota de cada asignatura</div></div>
      <div class="tarjeta-dato"><div class="etiqueta">Créditos aprobados</div><div class="valor">${h.creditosAprobados}</div>
        <div class="detalle">de ${h.creditosCursados} cursados con nota</div></div>
      <div class="tarjeta-dato"><div class="etiqueta">Semestres</div><div class="valor">${h.periodos.length}</div>
        <div class="detalle">${h.materiasEnCurso ? `${h.materiasEnCurso} materia(s) en curso` : "sin materias en curso"}</div></div>
    </section>
    ${proyectado !== null ? `<p class="nota-proyeccion">Si las materias en curso terminaran con lo que llevas hoy, tu PAPA quedaría en <b>${formatoNota(proyectado)}</b>. Las materias en curso no cuentan en el PAPA ni en el PA hasta tener nota definitiva.</p>` : ""}
    ${graficaHTML(h, aprob)}
    <div class="encabezado-seccion">
      <h2>Semestres</h2>
      <div class="espaciador"></div>
      <button class="boton primario" data-accion-hist="agregar-anterior">+ Semestre anterior</button>
    </div>
    <div class="lista-semestres">
      ${h.periodos.length ? [...h.periodos].reverse().map((p) => htmlPeriodo(p, aprob)).join("") : ""}
    </div>
    <p class="nota-proyeccion">Cálculo según el Estatuto Estudiantil (Acuerdo 008 de 2008): notas en décimas (las centésimas de 5 o más suben), PA con la última nota de cada asignatura y PAPA con todas, ponderadas por créditos. Las materias "Aprobado/Reprobado" y las canceladas no entran en los promedios. Una asignatura repetida se reconoce por su código (o por el nombre, si no tiene código). Para trámites, la cifra oficial es la del SIA.</p>`;
  activarGrafica();
}

function htmlPeriodo(p, aprob) {
  const s = p.semestre;
  const actual = s.id === estado.datos.semestreActivo;
  const chip = s.archivado ? `<span class="chip-estado" data-estado="sin-notas">Archivado</span>` : `<span class="chip-estado" data-estado="bien">En curso</span>`;
  const filas = p.filas.map((f) => {
    const m = f.materia;
    const nota = f.nota !== null ? formatoNota(f.nota, 1) : f.estado === "en-curso" ? "—" : m.calificacion === "ap" ? (f.estado === "aprobada" ? "AP" : "NA") : "—";
    return `<tr class="${f.estado}">
      <td><span class="punto-materia" style="background:${m.color || "var(--texto-3)"}"></span>${escapar(m.nombre)}${m.codigo ? ` <span class="codigo">${escapar(m.codigo)}</span>` : ""}${f.repetida ? ` <span class="etiqueta-mini">Repetida</span>` : ""}</td>
      <td class="num">${f.creditos}</td>
      <td class="num nota-def">${nota}</td>
      <td><span class="estado-mini" data-estado="${f.estado}">${ETIQUETA[f.estado]}</span></td>
    </tr>`;
  }).join("");
  return `<article class="periodo ${actual ? "actual" : ""}" data-semestre="${s.id}">
    <header class="periodo-cabeza">
      <div><h3>${escapar(s.nombre)} ${chip}</h3>
        <div class="meta">Promedio del periodo <b>${formatoNota(p.promedio)}</b> · ${p.creditosAprobados} de ${p.creditosCursados} créditos aprobados${p.enCurso ? ` · ${p.enCurso} en curso` : ""}</div></div>
      <div class="botones-fila">
        <button class="boton" data-accion-hist="abrir">Ver y editar</button>
        <button class="boton fantasma" data-accion-hist="archivar">${s.archivado ? "Desarchivar" : "Archivar"}</button>
      </div>
    </header>
    ${p.filas.length ? `<div class="tabla-scroll"><table class="tabla-hist">
      <thead><tr><th>Materia</th><th class="num">Créd.</th><th class="num">Definitiva</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody></table></div>` : `<p class="info-sync">Sin materias.</p>`}
  </article>`;
}

// ---------- gráfica: promedio por periodo (barras) y PAPA acumulado (línea) ----------
function graficaHTML(h, aprob) {
  const ps = h.periodos.filter((p) => p.promedio !== null);
  if (ps.length < 2) return "";
  const angosto = window.matchMedia("(max-width: 760px)").matches;
  const W = angosto ? 360 : 720, H = angosto ? 200 : 220, mI = 26, mD = angosto ? 8 : 12, mA = 14, mB = 26;
  const ancho = W - mI - mD, alto = H - mA - mB;
  const y = (v) => mA + alto - (v / 5) * alto;
  const paso = ancho / ps.length;
  const barra = Math.min(46, paso * 0.5);
  const x = (i) => mI + paso * i + paso / 2;
  const grilla = [0, 1, 2, 3, 4, 5].map((v) => `<line x1="${mI}" x2="${W - mD}" y1="${y(v)}" y2="${y(v)}" class="g-grilla"/><text x="${mI - 8}" y="${y(v) + 4}" class="g-eje" text-anchor="end">${v}</text>`).join("");
  const barras = ps.map((p, i) => {
    const top = y(p.promedio);
    return `<path d="M${x(i) - barra / 2},${y(0)} V${top + 4} Q${x(i) - barra / 2},${top} ${x(i) - barra / 2 + 4},${top} H${x(i) + barra / 2 - 4} Q${x(i) + barra / 2},${top} ${x(i) + barra / 2},${top + 4} V${y(0)} Z" class="g-barra"/>`;
  }).join("");
  const puntos = ps.map((p, i) => `${x(i)},${y(p.papaHastaAqui)}`);
  const linea = `<polyline points="${puntos.join(" ")}" class="g-linea"/>` + ps.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.papaHastaAqui)}" r="4.5" class="g-punto"/>`).join("");
  const ultimo = ps[ps.length - 1];
  const etiquetaFinal = `<text x="${Math.min(x(ps.length - 1) + 8, W - mD - 62)}" y="${y(ultimo.papaHastaAqui) - 10}" class="g-etiqueta">PAPA ${formatoNota(ultimo.papaHastaAqui)}</text>`;
  const ejeX = ps.map((p, i) => `<text x="${x(i)}" y="${H - 8}" class="g-eje" text-anchor="middle">${escapar(p.semestre.nombre)}</text>`).join("");
  const referencia = `<line x1="${mI}" x2="${W - mD}" y1="${y(aprob)}" y2="${y(aprob)}" class="g-ref"/>`;
  const zonas = ps.map((p, i) => `<rect x="${mI + paso * i}" y="${mA}" width="${paso}" height="${alto}" class="g-zona" data-i="${i}"
      data-info="${escapar(`${p.semestre.nombre}|${formatoNota(p.promedio)}|${formatoNota(p.papaHastaAqui)}|${p.creditosCursados}`)}"/>`).join("");
  return `<figure class="grafica-hist">
    <figcaption>
      <span class="leyenda"><span class="muestra-barra"></span>Promedio del periodo</span>
      <span class="leyenda"><span class="muestra-linea"></span>PAPA acumulado</span>
      <span class="leyenda"><span class="muestra-ref"></span>Aprobación ${formatoNota(aprob, 1)}</span>
    </figcaption>
    <div class="g-contenedor">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Promedio por semestre y PAPA acumulado">${grilla}${referencia}${barras}${linea}${etiquetaFinal}${ejeX}${zonas}</svg>
      <div class="g-tooltip oculto" role="status"></div>
    </div>
  </figure>`;
}

function activarGrafica() {
  const fig = document.querySelector(".grafica-hist");
  if (!fig) return;
  const tip = fig.querySelector(".g-tooltip");
  const mostrar = (zona) => {
    fig.querySelectorAll(".g-zona").forEach((z) => z.classList.toggle("activa", z === zona));
    const [nombre, prom, papa, cred] = zona.dataset.info.split("|");
    tip.innerHTML = `<b>${nombre}</b><span><i class="muestra-barra"></i>Promedio del periodo <b>${prom}</b></span><span><i class="muestra-linea"></i>PAPA hasta aquí <b>${papa}</b></span><span class="sutil">${cred} créditos con nota</span>`;
    tip.classList.remove("oculto");
    const r = zona.getBoundingClientRect();
    const c = fig.querySelector(".g-contenedor").getBoundingClientRect();
    const izq = r.left - c.left + r.width / 2;
    tip.style.left = `${Math.max(8, Math.min(izq - tip.offsetWidth / 2, c.width - tip.offsetWidth - 8))}px`;
  };
  fig.addEventListener("pointerover", (e) => { const z = e.target.closest(".g-zona"); if (z) mostrar(z); });
  fig.addEventListener("pointerleave", () => { tip.classList.add("oculto"); fig.querySelectorAll(".g-zona.activa").forEach((z) => z.classList.remove("activa")); });
}

// ---------- agregar semestre anterior ----------
let filasNuevas = [];

function abrirAgregarAnterior() {
  filasNuevas = [fila(), fila(), fila()];
  const f = $("#form-anterior");
  f.reset();
  $("#error-anterior").textContent = "";
  pintarFilasNuevas();
  $("#dialogo-anterior").showModal();
  f.nombre.focus();
}

const fila = () => ({ id: nuevoId(), nombre: "", codigo: "", creditos: "", nota: "", tipo: "numerica" });

function pintarFilasNuevas() {
  $("#filas-anterior").innerHTML = filasNuevas.map((r, i) => `
    <div class="fila-anterior" data-i="${i}">
      <input class="campo-celda" data-f="nombre" placeholder="Materia" value="${escapar(r.nombre)}" aria-label="Materia ${i + 1}">
      <input class="campo-celda" data-f="codigo" placeholder="Código" value="${escapar(r.codigo)}" aria-label="Código">
      <input class="campo-celda numero" data-f="creditos" placeholder="Créd." inputmode="numeric" value="${escapar(r.creditos)}" aria-label="Créditos">
      <select class="campo-celda" data-f="tipo" aria-label="Tipo de nota">
        <option value="numerica" ${r.tipo === "numerica" ? "selected" : ""}>Nota</option>
        <option value="ap" ${r.tipo === "ap" ? "selected" : ""}>Aprobó (AP)</option>
        <option value="na" ${r.tipo === "na" ? "selected" : ""}>Reprobó (NA)</option>
        <option value="cancelada" ${r.tipo === "cancelada" ? "selected" : ""}>Cancelada</option>
      </select>
      <input class="campo-celda numero" data-f="nota" placeholder="0–5" inputmode="decimal" value="${escapar(r.nota)}" aria-label="Nota final" ${r.tipo !== "numerica" ? "disabled" : ""}>
      <button type="button" class="boton-quitar" data-quitar-fila aria-label="Quitar fila">×</button>
    </div>`).join("");
}

export function iniciarHistorial() {
  $("#vista-historial").addEventListener("click", (e) => {
    const b = e.target.closest("[data-accion-hist]");
    if (!b) return;
    const id = b.closest("[data-semestre]")?.dataset.semestre;
    const d = estado.datos;
    const s = d.semestres.find((x) => x.id === id);
    switch (b.dataset.accionHist) {
      case "agregar-anterior": abrirAgregarAnterior(); break;
      case "abrir":
        d.semestreActivo = s.id;
        document.dispatchEvent(new CustomEvent("subvista-notas", { detail: "semestre" }));
        guardar();
        pintar();
        break;
      case "archivar":
        s.archivado = !s.archivado;
        guardar();
        pintar();
        toast(s.archivado ? `Archivaste ${s.nombre}` : `${s.nombre} vuelve a estar en curso`);
        break;
    }
  });

  $("#filas-anterior").addEventListener("input", (e) => {
    const el = e.target.closest("[data-f]");
    if (!el) return;
    filasNuevas[Number(el.closest("[data-i]").dataset.i)][el.dataset.f] = el.value;
    if (el.dataset.f === "tipo") pintarFilasNuevas();
  });
  $("#filas-anterior").addEventListener("change", (e) => {
    if (e.target.dataset.f === "tipo") { filasNuevas[Number(e.target.closest("[data-i]").dataset.i)].tipo = e.target.value; pintarFilasNuevas(); }
  });
  $("#filas-anterior").addEventListener("click", (e) => {
    if (!e.target.closest("[data-quitar-fila]")) return;
    filasNuevas.splice(Number(e.target.closest("[data-i]").dataset.i), 1);
    if (!filasNuevas.length) filasNuevas.push(fila());
    pintarFilasNuevas();
  });
  $("#boton-otra-fila").addEventListener("click", () => {
    filasNuevas.push(fila());
    pintarFilasNuevas();
    document.querySelector(`.fila-anterior[data-i="${filasNuevas.length - 1}"] [data-f=nombre]`)?.focus();
  });

  $("#form-anterior").addEventListener("submit", (e) => {
    const f = e.target;
    const d = estado.datos;
    const err = (t) => { e.preventDefault(); $("#error-anterior").textContent = t; };
    const nombre = f.nombre.value.trim();
    if (!nombre) return err("Ponle nombre al semestre (ej. 2025-2).");
    if (d.semestres.some((s) => s.nombre.toLowerCase() === nombre.toLowerCase())) return err("Ya tienes un semestre con ese nombre.");
    const usadas = filasNuevas.filter((r) => r.nombre.trim());
    if (!usadas.length) return err("Agrega al menos una materia.");
    const materias = [];
    for (const [i, r] of usadas.entries()) {
      const cred = parseInt(r.creditos, 10);
      if (!(cred >= 1 && cred <= 20)) return err(`"${r.nombre}": los créditos deben ser un número entre 1 y 20.`);
      const m = { id: nuevoId(), nombre: r.nombre.trim(), codigo: r.codigo.trim(), creditos: cred, docente: "", color: COLORES[i % COLORES.length], trabajos: [] };
      if (r.tipo === "numerica") {
        const n = interpretarNota(r.nota);
        if (!n.ok || n.valor === null) return err(`"${r.nombre}": escribe la nota final (0 a 5).`);
        m.notaFinal = n.valor;
      } else if (r.tipo === "cancelada") m.cancelada = true;
      else { m.calificacion = "ap"; m.aprobada = r.tipo === "ap"; }
      materias.push(m);
    }
    const nuevo = { id: nuevoId(), nombre, creado: new Date().toISOString(), archivado: true, materias, horario: [] };
    d.semestres = ordenarSemestres([...d.semestres, nuevo]);
    guardar();
    pintar();
    toast(`Agregaste ${nombre} con ${materias.length} materia(s)`);
  });
}

// Al girar el celular o cambiar el tamaño de la ventana, la gráfica se redibuja a su ancho.
let anchoAnterior = window.innerWidth;
window.addEventListener("resize", () => {
  const angostoAntes = anchoAnterior <= 760;
  anchoAnterior = window.innerWidth;
  if (angostoAntes !== (anchoAnterior <= 760) && document.querySelector(".grafica-hist")) pintarHistorial();
});
