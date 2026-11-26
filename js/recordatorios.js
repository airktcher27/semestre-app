// Avisos de recordatorios. Sin servidor no hay notificaciones con la app cerrada:
// funcionan con la app abierta (o instalada y en segundo plano mientras el navegador la mantenga viva).
import { estado, preferencia, guardarPreferencia, toast } from "./nucleo.js";
import { momentoRecordatorio, horaBonita, fechaRelativa } from "./fechas.js";

const VENTANA_MS = 12 * 60 * 60 * 1000; // no avisar de cosas de hace más de 12 h

export function estadoPermiso() {
  if (!("Notification" in window)) return "no-disponible";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function pedirPermisoNotificaciones() {
  if (estadoPermiso() !== "default") return estadoPermiso();
  try {
    return await Notification.requestPermission();
  } catch {
    return estadoPermiso();
  }
}

async function mostrar(titulo, cuerpo, etiqueta) {
  if (estadoPermiso() === "granted") {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(titulo, { body: cuerpo, tag: etiqueta, icon: "img/icono-192.png", badge: "img/icono-192.png" });
        return;
      }
      new Notification(titulo, { body: cuerpo, tag: etiqueta, icon: "img/icono-192.png" });
      return;
    } catch {}
  }
  toast(`🔔 ${titulo}${cuerpo ? ` · ${cuerpo}` : ""}`);
}

export function revisarRecordatorios(ahora = new Date()) {
  if (!estado.datos) return;
  const avisados = preferencia("avisados", {});
  let cambio = false;
  for (const t of estado.datos.tareas) {
    if (t.hecha) continue;
    const m = momentoRecordatorio(t);
    if (!m) continue;
    const clave = `${t.id}@${m.toISOString()}`;
    if (avisados[clave]) continue;
    const dif = ahora - m;
    if (dif >= 0 && dif < VENTANA_MS) {
      avisados[clave] = Date.now();
      cambio = true;
      const cuando = `${fechaRelativa(t.fecha)}${t.hora ? `, ${horaBonita(t.hora)}` : ""}`;
      mostrar(t.titulo, cuando, t.id);
    }
  }
  if (cambio) {
    // Limpia avisos viejos (más de 30 días).
    const limite = Date.now() - 30 * 86400000;
    for (const k of Object.keys(avisados)) if (avisados[k] < limite) delete avisados[k];
    guardarPreferencia("avisados", avisados);
  }
}

export function iniciarRecordatorios() {
  revisarRecordatorios();
  setInterval(revisarRecordatorios, 30000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && revisarRecordatorios());
}
