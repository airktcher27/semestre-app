// Utilidades de fechas. Todo en hora local; las fechas se guardan como "AAAA-MM-DD"
// y las horas como "HH:MM". Funciones puras para poder probarlas.

export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dos = (n) => String(n).padStart(2, "0");

export function aISO(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function deISO(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function hoyISO(ahora = new Date()) {
  return aISO(ahora);
}

export function sumarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

export function diferenciaDias(desde, hasta) {
  return Math.round((deISO(hasta) - deISO(desde)) / 86400000);
}

export function diaSemana(iso) {
  return deISO(iso).getDay();
}

// Lunes de la semana de esa fecha.
export function inicioSemana(iso) {
  const d = diaSemana(iso);
  return sumarDias(iso, d === 0 ? -6 : 1 - d);
}

export function inicioMes(iso) {
  return iso.slice(0, 8) + "01";
}

export function sumarMeses(iso, n) {
  const d = deISO(inicioMes(iso));
  d.setMonth(d.getMonth() + n);
  return aISO(d);
}

// "jueves 26 de noviembre" (+ año si no es el actual)
export function fechaLarga(iso, hoy = hoyISO()) {
  const d = deISO(iso);
  const año = d.getFullYear() !== deISO(hoy).getFullYear() ? ` de ${d.getFullYear()}` : "";
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}${año}`;
}

// "26 nov" / "26 nov 2027"
export function fechaCorta(iso, hoy = hoyISO()) {
  const d = deISO(iso);
  const año = d.getFullYear() !== deISO(hoy).getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}${año}`;
}

// Texto relativo para mostrar junto a una tarea.
export function fechaRelativa(iso, hoy = hoyISO()) {
  const dif = diferenciaDias(hoy, iso);
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Mañana";
  if (dif === -1) return "Ayer";
  if (dif > 1 && dif < 7) return capital(DIAS[diaSemana(iso)]);
  return fechaCorta(iso, hoy);
}

export function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "15:30" → "3:30 p. m."
export function horaBonita(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const sufijo = h < 12 ? "a. m." : "p. m.";
  h = h % 12 || 12;
  return `${h}${m ? `:${dos(m)}` : ""} ${sufijo}`;
}

export function minutosDeHora(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function horaDeMinutos(min) {
  min = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${dos(Math.floor(min / 60))}:${dos(min % 60)}`;
}

// Atajos del selector de fecha (como en tus fotos).
export function atajos(hoy = hoyISO()) {
  const d = diaSemana(hoy);
  const manana = sumarDias(hoy, 1);
  // Este fin de semana: el sábado próximo (o hoy si ya es sábado; si es domingo, hoy).
  const finde = d === 6 || d === 0 ? hoy : sumarDias(hoy, 6 - d);
  // Próxima semana: el lunes siguiente.
  const proxLunes = sumarDias(inicioSemana(hoy), 7);
  return [
    { id: "hoy", texto: "Hoy", fecha: hoy },
    { id: "manana", texto: "Mañana", fecha: manana },
    { id: "finde", texto: "Este fin de semana", fecha: finde },
    { id: "proxima", texto: "Próxima semana", fecha: proxLunes },
  ];
}

const NOMBRES_DIA = {
  domingo: 0, dom: 0, lunes: 1, lun: 1, martes: 2, mar: 2, miercoles: 3, mie: 3,
  jueves: 4, jue: 4, viernes: 5, vie: 5, sabado: 6, sab: 6,
};

const NOMBRES_MES = {};
MESES.forEach((m, i) => { NOMBRES_MES[m] = i; NOMBRES_MES[m.slice(0, 3)] = i; });
NOMBRES_MES.setiembre = 8;
NOMBRES_MES.sept = 8;

function sinTildes(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Extrae una hora: "15:30", "3pm", "3:30 pm", "a las 3", "a las 3 p. m.", "8h"
function extraerHora(texto) {
  const patrones = [
    /\b(?:a las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\s|$)/,
    /\b(?:a las?\s+)?(\d{1,2}):(\d{2})\b/,
    /\ba las?\s+(\d{1,2})\b/,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (!m) continue;
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const sufijo = (m[3] || "").replace(/[.\s]/g, "");
    if (sufijo === "pm" && h < 12) h += 12;
    if (sufijo === "am" && h === 12) h = 0;
    if (!sufijo && p === patrones[2] && h >= 1 && h <= 6) h += 12; // "a las 3" → 3 p. m.
    if (h > 23 || min > 59) continue;
    return { hora: `${dos(h)}:${dos(min)}`, resto: texto.replace(m[0], " ").replace(/\s+/g, " ").trim() };
  }
  return { hora: null, resto: texto };
}

// Entiende lo que escribes en "Escribe una fecha". Devuelve { fecha, hora } o null.
export function interpretarFecha(entrada, hoy = hoyISO()) {
  let t = sinTildes(String(entrada || "").toLowerCase().trim());
  if (!t) return null;
  const { hora, resto } = extraerHora(t);
  t = resto.replace(/^(el|este|esta|para el|para)\s+/, "").trim();

  let fecha = null;
  let m;
  if (t === "" && hora) fecha = hoy;
  else if (t === "hoy") fecha = hoy;
  else if (t === "manana") fecha = sumarDias(hoy, 1);
  else if (t === "pasado manana" || t === "pasado") fecha = sumarDias(hoy, 2);
  else if (/^(fin de semana|finde|este fin de semana)$/.test(t)) fecha = atajos(hoy)[2].fecha;
  else if (/^(proxima semana|la proxima semana|semana que viene)$/.test(t)) fecha = atajos(hoy)[3].fecha;
  else if ((m = t.match(/^en (\d{1,3}) (dia|dias|semana|semanas)$/))) {
    fecha = sumarDias(hoy, Number(m[1]) * (m[2].startsWith("semana") ? 7 : 1));
  } else if ((m = t.match(/^(?:(proximo|siguiente)\s+)?([a-z]+)(?:\s+(?:que viene|proximo))?$/)) && t.split(" ").some((w) => w in NOMBRES_DIA)) {
    const nombre = t.split(" ").find((w) => w in NOMBRES_DIA);
    const objetivo = NOMBRES_DIA[nombre];
    let dif = (objetivo - diaSemana(hoy) + 7) % 7;
    if (dif === 0) dif = 7; // "jueves" un jueves = el de la otra semana
    fecha = sumarDias(hoy, dif);
  } else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    fecha = valida(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    const año = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    fecha = conAñoInteligente(Number(m[1]), Number(m[2]) - 1, año, hoy);
  } else if ((m = t.match(/^(?:[a-z]+\s+)?(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?(?:\s+(?:de\s+)?(\d{4}))?$/)) && m[2] in NOMBRES_MES) {
    fecha = conAñoInteligente(Number(m[1]), NOMBRES_MES[m[2]], m[3] ? Number(m[3]) : null, hoy);
  } else if ((m = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:\s+(\d{4}))?$/)) && m[1] in NOMBRES_MES) {
    fecha = conAñoInteligente(Number(m[2]), NOMBRES_MES[m[1]], m[3] ? Number(m[3]) : null, hoy);
  }
  if (!fecha) return null;
  return { fecha, hora };
}

function valida(año, mes, dia) {
  const d = new Date(año, mes, dia);
  if (d.getFullYear() !== año || d.getMonth() !== mes || d.getDate() !== dia) return null;
  return aISO(d);
}

// Sin año: si la fecha ya pasó este año, se entiende el año siguiente.
function conAñoInteligente(dia, mes, año, hoy) {
  if (año) return valida(año, mes, dia);
  const actual = deISO(hoy).getFullYear();
  const f = valida(actual, mes, dia);
  if (f && f < hoy) return valida(actual + 1, mes, dia);
  return f;
}

// Momento (Date) en que debe sonar un recordatorio. Sin hora, se toma las 8:00 a. m.
export function momentoRecordatorio(tarea) {
  if (tarea.recordatorio === null || tarea.recordatorio === undefined || !tarea.fecha) return null;
  const d = deISO(tarea.fecha);
  const [h, m] = (tarea.hora || "08:00").split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() - tarea.recordatorio * 60000);
}
