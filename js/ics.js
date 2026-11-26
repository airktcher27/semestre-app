// Exporta tareas y clases a un archivo .ics (Google Calendar, Calendario de Android, Outlook).
// Cada evento tiene un identificador fijo: si vuelves a importar, el calendario lo actualiza
// en lugar de duplicarlo (Google y Outlook lo respetan).
import { sumarDias, deISO, aISO, diaSemana } from "./fechas.js";

const CRLF = "\r\n";

function escaparTexto(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Las líneas de un .ics no deben pasar de 75 bytes.
function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const partes = [];
  let actual = "";
  let largo = 0;
  for (const ch of linea) {
    const b = new TextEncoder().encode(ch).length;
    if (largo + b > (partes.length ? 74 : 75)) {
      partes.push(actual);
      actual = "";
      largo = 0;
    }
    actual += ch;
    largo += b;
  }
  partes.push(actual);
  return partes.join(CRLF + " ");
}

const fechaICS = (iso) => iso.replace(/-/g, "");
const fechaHoraICS = (iso, hhmm) => `${fechaICS(iso)}T${hhmm.replace(":", "")}00`;

function sumarMinutos(iso, hhmm, min) {
  const d = deISO(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m + min, 0, 0);
  return { fecha: aISO(d), hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}

function marcaUTC(fecha = new Date()) {
  return fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// tareas: [{ id, titulo, fecha, hora, recordatorio, descripcion, etiqueta }]
// clases: [{ id, titulo, dia (0=dom), inicio, fin, lugar }]
export function generarICS({ tareas = [], clases = [], semanasClases = 18, desde, ahora = new Date() }) {
  const l = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Semestre//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Semestre",
  ];
  const stamp = marcaUTC(ahora);

  for (const t of tareas) {
    if (!t.fecha) continue;
    l.push("BEGIN:VEVENT", `UID:tarea-${t.id}@semestre-app`, `DTSTAMP:${stamp}`);
    if (t.hora) {
      const fin = sumarMinutos(t.fecha, t.hora, 60);
      l.push(`DTSTART:${fechaHoraICS(t.fecha, t.hora)}`, `DTEND:${fechaHoraICS(fin.fecha, fin.hora)}`);
    } else {
      l.push(`DTSTART;VALUE=DATE:${fechaICS(t.fecha)}`, `DTEND;VALUE=DATE:${fechaICS(sumarDias(t.fecha, 1))}`);
    }
    l.push(`SUMMARY:${escaparTexto(t.etiqueta ? `${t.titulo} · ${t.etiqueta}` : t.titulo)}`);
    if (t.descripcion) l.push(`DESCRIPTION:${escaparTexto(t.descripcion)}`);
    if (t.recordatorio !== null && t.recordatorio !== undefined) {
      // Sin hora, el aviso es relativo a las 8:00 a. m. de ese día.
      const minutos = t.hora ? -t.recordatorio : 8 * 60 - t.recordatorio;
      const signo = minutos < 0 ? "-" : "";
      l.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escaparTexto(t.titulo)}`, `TRIGGER:${signo}PT${Math.abs(minutos)}M`, "END:VALARM");
    }
    l.push("END:VEVENT");
  }

  const DIAS_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  for (const c of clases) {
    // Primera ocurrencia: el primer día de la semana indicado desde "desde".
    let primera = desde;
    while (diaSemana(primera) !== c.dia) primera = sumarDias(primera, 1);
    l.push(
      "BEGIN:VEVENT",
      `UID:clase-${c.id}@semestre-app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fechaHoraICS(primera, c.inicio)}`,
      `DTEND:${fechaHoraICS(primera, c.fin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DIAS_ICS[c.dia]};COUNT=${semanasClases}`,
      `SUMMARY:${escaparTexto(c.titulo)}`
    );
    if (c.lugar) l.push(`LOCATION:${escaparTexto(c.lugar)}`);
    l.push("END:VEVENT");
  }

  l.push("END:VCALENDAR");
  return l.map(plegar).join(CRLF) + CRLF;
}
