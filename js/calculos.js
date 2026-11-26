// Cálculos de notas. Funciones puras (sin tocar la página) para poder probarlas.
// Escala 0.0 – 5.0; los porcentajes de cada materia deberían sumar 100.

const EPS = 1e-9;

export function esNota(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 5;
}

export function resumenMateria(materia) {
  const trabajos = materia.trabajos || [];
  let porcentajeTotal = 0;
  let evaluado = 0;
  let puntos = 0; // suma de nota × porcentaje / 100
  let calificados = 0;
  for (const t of trabajos) {
    const p = Number(t.porcentaje) || 0;
    porcentajeTotal += p;
    if (esNota(t.nota)) {
      evaluado += p;
      puntos += (t.nota * p) / 100;
      calificados++;
    }
  }
  const promedioEvaluado = evaluado > EPS ? puntos / (evaluado / 100) : null;
  return {
    porcentajeTotal: redondear(porcentajeTotal, 4),
    sumaCorrecta: Math.abs(porcentajeTotal - 100) < 0.001,
    evaluado: redondear(evaluado, 4), // % de la materia ya calificado
    pendiente: redondear(Math.max(0, 100 - evaluado), 4),
    acumulada: redondear(puntos, 4), // lo que ya llevas sobre 5.0
    promedioEvaluado: promedioEvaluado === null ? null : redondear(promedioEvaluado, 4),
    completa: Math.abs(evaluado - 100) < 0.001,
    trabajos: trabajos.length,
    calificados,
  };
}

// Estado para colorear la tarjeta, según cómo vas en lo ya calificado.
export function estadoMateria(resumen, notaAprobacion = 3.0, margen = 0.3) {
  if (resumen.promedioEvaluado === null) return "sin-notas";
  if (resumen.promedioEvaluado >= notaAprobacion - EPS) return "bien";
  if (resumen.promedioEvaluado >= notaAprobacion - margen - EPS) return "cuidado";
  return "riesgo";
}

// Promedio del semestre ponderado por créditos.
// Usa el promedio sobre lo evaluado de cada materia que ya tenga al menos una nota.
export function resumenSemestre(semestre) {
  const materias = semestre?.materias || [];
  let sumaPonderada = 0;
  let creditosConNota = 0;
  let creditosTotales = 0;
  let sinCreditos = 0;
  let completas = 0;
  for (const m of materias) {
    const c = Number(m.creditos) || 0;
    if (m.cancelada) continue;
    creditosTotales += c;
    if (c <= 0) sinCreditos++;
    if (m.cancelada || m.calificacion === "ap") continue; // no entran en el promedio
    const r = resumenMateria(m);
    const nota = esNota(m.notaFinal) ? redondearUNAL(m.notaFinal) : r.promedioEvaluado;
    if (r.completa || esNota(m.notaFinal)) completas++;
    if (nota !== null && c > 0) {
      sumaPonderada += nota * c;
      creditosConNota += c;
    }
  }
  return {
    promedio: creditosConNota > 0 ? redondear(sumaPonderada / creditosConNota, 4) : null,
    creditosTotales,
    creditosConNota,
    materias: materias.length,
    completas,
    sinCreditos,
  };
}

export function redondear(n, decimales = 2) {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// Muestra una nota con 2 decimales, coma decimal (formato colombiano).
export function formatoNota(n, decimales = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(decimales).replace(".", ",");
}

export function formatoPorcentaje(n) {
  if (!Number.isFinite(n)) return "—";
  const r = redondear(n, 2);
  return `${Number.isInteger(r) ? r : String(r).replace(".", ",")} %`;
}

// Lee lo que escribe la persona: acepta "4,5", "4.5", "45" (→ 4.5 si no cabe en 0–5), vacío = sin nota.
export function interpretarNota(texto) {
  const s = String(texto ?? "").trim().replace(",", ".");
  if (s === "") return { ok: true, valor: null };
  let n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "Escribe un número entre 0 y 5." };
  if (n > 5 && n <= 50 && /^\d{2}$/.test(s)) n = n / 10; // "45" → 4.5
  if (n < 0 || n > 5) return { ok: false, error: "La nota debe estar entre 0 y 5." };
  return { ok: true, valor: redondear(n, 2) };
}

export function interpretarPorcentaje(texto) {
  const s = String(texto ?? "").trim().replace("%", "").replace(",", ".");
  if (s === "") return { ok: false, error: "Escribe el porcentaje." };
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return { ok: false, error: "El porcentaje debe estar entre 0 y 100." };
  return { ok: true, valor: redondear(n, 2) };
}

// =====================================================================
// Fase 3 · definitivas, PA, PAPA e historial (Acuerdo 008 de 2008, UNAL)
// =====================================================================

// Art. 30: notas en unidades y décimas; centésimas ≥ 5 suben a la décima superior.
export function redondearUNAL(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.floor(n * 10 + 0.5 + 1e-9) / 10;
}

// Nota definitiva de una materia.
//  estado: "en-curso" | "aprobada" | "reprobada" | "cancelada"
//  nota: número (escala 0–5) o null si no aplica (en curso, cancelada, Aprobado/Reprobado)
export function definitivaMateria(m, notaAprobacion = 3.0) {
  if (m.cancelada) return { estado: "cancelada", nota: null, numerica: false };
  if (m.calificacion === "ap") {
    if (m.aprobada === true) return { estado: "aprobada", nota: null, numerica: false };
    if (m.aprobada === false) return { estado: "reprobada", nota: null, numerica: false };
    return { estado: "en-curso", nota: null, numerica: false };
  }
  let nota = null;
  let origen = null;
  if (esNota(m.notaFinal)) { nota = redondearUNAL(m.notaFinal); origen = "manual"; }
  else {
    const r = resumenMateria(m);
    if (r.completa && r.sumaCorrecta) { nota = redondearUNAL(r.acumulada); origen = "calculada"; }
  }
  if (nota === null) return { estado: "en-curso", nota: null, numerica: true };
  return { estado: nota >= notaAprobacion - 1e-9 ? "aprobada" : "reprobada", nota, numerica: true, origen };
}

// Identifica la misma asignatura en distintos semestres: por código si lo tiene, si no por nombre.
export function claveAsignatura(m) {
  const codigo = String(m.codigo || "").trim().toUpperCase();
  if (codigo) return `c:${codigo}`;
  return `n:${String(m.nombre || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ")}`;
}

// Orden cronológico: "2025-1" < "2025-2" < "2026-1"; si el nombre no tiene ese formato, por fecha de creación.
export function claveOrdenSemestre(s) {
  const m = String(s.nombre || "").match(/(\d{4})\D{0,3}([12])/);
  if (m) return `${m[1]}-${m[2]}`;
  return `z-${s.creado || ""}`;
}

export function ordenarSemestres(semestres) {
  return [...semestres].sort((a, b) => claveOrdenSemestre(a).localeCompare(claveOrdenSemestre(b)));
}

// Historial completo: por semestre (promedio del periodo, créditos) y acumulados (PA, PAPA).
export function historial(semestres, notaAprobacion = 3.0) {
  const ordenados = ordenarSemestres(semestres);
  const vistas = new Map(); // clave asignatura → veces vista (para marcar repetidas)
  const ultimas = new Map(); // clave asignatura → { nota, creditos } (para el PA)
  let sumaPAPA = 0, credPAPA = 0;
  let credCursados = 0, credAprobados = 0, enCurso = 0;
  const periodos = [];

  for (const s of ordenados) {
    let suma = 0, cred = 0, cursados = 0, aprobados = 0, cursoPeriodo = 0;
    const filas = (s.materias || []).map((m) => {
      const c = Number(m.creditos) || 0;
      const d = definitivaMateria(m, notaAprobacion);
      const clave = claveAsignatura(m);
      const vez = d.estado === "cancelada" ? 0 : (vistas.get(clave) || 0) + 1;
      if (d.estado !== "cancelada") vistas.set(clave, vez);
      if (d.estado === "en-curso") cursoPeriodo++;
      if (d.estado === "aprobada" || d.estado === "reprobada") {
        cursados += c;
        if (d.estado === "aprobada") aprobados += c;
      }
      if (d.nota !== null && c > 0) {
        suma += d.nota * c;
        cred += c;
        ultimas.set(clave, { nota: d.nota, creditos: c });
      }
      return { materia: m, creditos: c, ...d, repetida: vez > 1, vez };
    });
    sumaPAPA += suma;
    credPAPA += cred;
    credCursados += cursados;
    credAprobados += aprobados;
    enCurso += cursoPeriodo;
    periodos.push({
      semestre: s,
      filas,
      promedio: cred > 0 ? suma / cred : null,
      creditosCursados: cursados,
      creditosAprobados: aprobados,
      enCurso: cursoPeriodo,
      papaHastaAqui: credPAPA > 0 ? sumaPAPA / credPAPA : null,
    });
  }

  let sumaPA = 0, credPA = 0;
  for (const u of ultimas.values()) { sumaPA += u.nota * u.creditos; credPA += u.creditos; }

  return {
    periodos,
    papa: credPAPA > 0 ? sumaPAPA / credPAPA : null,
    pa: credPA > 0 ? sumaPA / credPA : null,
    creditosCursados: credCursados,
    creditosAprobados: credAprobados,
    materiasEnCurso: enCurso,
  };
}

// Cómo quedaría el PAPA si las materias en curso terminaran con lo que llevas ("sobre lo evaluado").
// No es una meta ni dice cuánto necesitas: solo una foto de cómo vas.
export function papaConEnCurso(semestres, notaAprobacion = 3.0) {
  let suma = 0, cred = 0;
  for (const s of semestres) {
    for (const m of s.materias || []) {
      const c = Number(m.creditos) || 0;
      if (c <= 0) continue;
      const d = definitivaMateria(m, notaAprobacion);
      let nota = d.nota;
      if (d.estado === "en-curso" && d.numerica) {
        const r = resumenMateria(m);
        if (r.promedioEvaluado !== null) nota = r.promedioEvaluado;
      }
      if (nota !== null) { suma += nota * c; cred += c; }
    }
  }
  return cred > 0 ? suma / cred : null;
}
