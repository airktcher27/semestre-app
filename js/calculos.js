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
    creditosTotales += c;
    if (c <= 0) sinCreditos++;
    const r = resumenMateria(m);
    if (r.completa) completas++;
    if (r.promedioEvaluado !== null && c > 0) {
      sumaPonderada += r.promedioEvaluado * c;
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
