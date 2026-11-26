// Semestre · arranque, pestañas, sincronización y ajustes
import { crearDocumento, ESTADOS } from "./comun/documento.js";
import { aRegistros, desdeRegistros } from "./registros.js";
import { datosLegados, configLegada, crearMigracionRemota, limpiarDatosLocalesLegados } from "./legado.js";
import {
  VERSION, ESQUEMA, estado, ganchos, $, escapar, nuevoId, clonar, semestre, toast,
  antesDeCambio, tomarAnterior, olvidarAnterior, preferencia, guardarPreferencia, COLORES,
} from "./nucleo.js";
import { interpretarNota } from "./calculos.js";
import { pintarNotas, iniciarNotas, notaEditable } from "./vistas/notas.js";
import { pintarTareas, iniciarTareas } from "./vistas/tareas.js";
import { pintarCalendario, iniciarCalendario, exportarICS } from "./vistas/calendario.js";
import { iniciarRecordatorios, estadoPermiso, pedirPermisoNotificaciones } from "./recordatorios.js";
import { cerrarPopover } from "./componentes/popover.js";

const PALETAS = [
  { id: "tomate", nombre: "Tomate", color: "#dc4c3e" },
  { id: "indigo", nombre: "Índigo", color: "#5b5fd6" },
  { id: "esmeralda", nombre: "Esmeralda", color: "#1f9a6f" },
  { id: "oceano", nombre: "Océano", color: "#2b7fc4" },
  { id: "ciruela", nombre: "Ciruela", color: "#9b4fb8" },
  { id: "ambar", nombre: "Ámbar", color: "#c9821a" },
  { id: "grafito", nombre: "Grafito", color: "#55606e" },
];

// ---------- datos ----------
function nombreSemestreActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${fecha.getMonth() < 6 ? 1 : 2}`;
}

function semestreVacio(nombre = nombreSemestreActual(), id = nuevoId()) {
  return { id, nombre, creado: new Date().toISOString(), materias: [], horario: [] };
}

// Ids fijos: dos dispositivos que empiezan de cero no duplican el semestre ni la lista.
function datosIniciales() {
  const nombre = nombreSemestreActual();
  const s = semestreVacio(nombre, "sem-inicial");
  s.creado = "2000-01-01T00:00:00.000Z";
  return {
    esquema: ESQUEMA,
    ajustes: { notaAprobacion: 3.0, tema: "auto", paleta: "tomate" },
    semestres: [s],
    semestreActivo: s.id,
    listas: [{ id: "personal", nombre: "Personal", color: COLORES[7] }],
    tareas: [],
  };
}

// Completa lo que falte (datos de la versión 0.1, respaldos viejos, etc.).
function normalizar(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.semestres)) return datosIniciales();
  d.ajustes = { notaAprobacion: 3.0, tema: "auto", paleta: "tomate", ...(d.ajustes || {}) };
  if (d.semestres.length === 0) d.semestres.push(semestreVacio());
  for (const s of d.semestres) {
    s.materias ||= [];
    s.horario ||= [];
    for (const m of s.materias) {
      m.trabajos ||= [];
      m.color ||= COLORES[0];
    }
  }
  if (!Array.isArray(d.listas)) d.listas = [{ id: "personal", nombre: "Personal", color: COLORES[7] }];
  if (!Array.isArray(d.tareas)) d.tareas = [];
  for (const t of d.tareas) {
    t.destino ||= { tipo: "bandeja" };
    t.prioridad ||= 4;
    t.recordatorio ??= null;
    t.evaluacion ??= null;
    t.descripcion ??= "";
  }
  // El semestre que estás viendo es de cada dispositivo (no se sincroniza).
  const elegido = preferencia("semestreActivo", null) || d.semestreActivo;
  d.semestreActivo = d.semestres.some((s) => s.id === elegido) ? elegido : d.semestres[d.semestres.length - 1].id;
  d.esquema = ESQUEMA;
  return d;
}

let listo = false;
const sync = await crearDocumento({
  app: "semestre",
  version: VERSION,
  inicial: datosIniciales,
  aRegistros,
  desdeRegistros,
  datosLegados: () => {
    const v = datosLegados();
    return v ? { ...v, datos: normalizar(v.datos) } : null;
  },
  configLegada,
  antesDeSincronizar: crearMigracionRemota({ aRegistros, normalizar }),
  pedirContrasena,
  alCambiar: ({ estado: e, mensaje, datosCambiaron }) => {
    if (!listo) return;
    if (datosCambiaron) {
      estado.datos = normalizar(clonar(sync.datos));
      aplicarApariencia();
      pintar();
    }
    pintarEstadoSync(e, mensaje);
  },
});

function guardar({ deshacible = false } = {}) {
  guardarPreferencia("semestreActivo", estado.datos.semestreActivo);
  sync.guardar(clonar(estado.datos));
  if (!deshacible) olvidarAnterior();
}

// ---------- apariencia ----------
function aplicarApariencia() {
  const { tema, paleta } = estado.datos.ajustes;
  const real = tema === "claro" || tema === "oscuro" ? tema : matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "oscuro";
  document.documentElement.dataset.tema = real;
  document.documentElement.dataset.paleta = paleta;
  $('meta[name="theme-color"]').setAttribute("content", real === "claro" ? "#f6f6f4" : "#1e1e1e");
  try { localStorage.setItem("semestre:apariencia", JSON.stringify({ tema, paleta })); } catch {}
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => estado.datos && aplicarApariencia());

// ---------- pestañas ----------
const VISTAS = ["tareas", "calendario", "notas"];
let vista = VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : preferencia("vista", "tareas");

function cambiarVista(nueva) {
  if (!VISTAS.includes(nueva)) return;
  vista = nueva;
  guardarPreferencia("vista", vista);
  if (location.hash !== `#${vista}`) history.replaceState(null, "", `#${vista}`);
  cerrarPopover();
  pintar();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => cambiarVista(location.hash.slice(1)));

// ---------- pintar ----------
function pintar() {
  const activo = document.activeElement;
  const claveFoco = activo?.dataset?.foco;
  const seleccion = claveFoco && "selectionStart" in activo ? [activo.selectionStart, activo.selectionEnd] : null;

  for (const v of VISTAS) $(`#vista-${v}`).classList.toggle("oculto", v !== vista);
  document.querySelectorAll("[data-vista]").forEach((b) => b.setAttribute("aria-current", b.dataset.vista === vista ? "page" : "false"));
  pintarSelectorSemestre();
  if (vista === "tareas") pintarTareas();
  else if (vista === "calendario") pintarCalendario();
  else pintarNotas();

  if (claveFoco) {
    const el = document.querySelector(`[data-foco="${CSS.escape(claveFoco)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (seleccion && el.setSelectionRange) try { el.setSelectionRange(...seleccion); } catch {}
    }
  }
}

function pintarSelectorSemestre() {
  const sel = $("#selector-semestre");
  const d = estado.datos;
  sel.innerHTML =
    d.semestres.map((s) => `<option value="${s.id}" ${s.id === d.semestreActivo ? "selected" : ""}>${escapar(s.nombre)}</option>`).join("") +
    `<option value="__nuevo">+ Nuevo semestre…</option>`;
}

// ---------- estado de sincronización ----------
const TEXTO_SYNC = {
  [ESTADOS.SIN_CONFIGURAR]: "Sin conectar",
  [ESTADOS.BLOQUEADO]: "Falta contraseña",
  [ESTADOS.SINCRONIZADO]: "Sincronizado",
  [ESTADOS.PENDIENTE]: "Guardando…",
  [ESTADOS.SINCRONIZANDO]: "Sincronizando…",
  [ESTADOS.ERROR]: "Error",
  [ESTADOS.SIN_CONEXION]: "Sin conexión",
};

function pintarEstadoSync(e, mensaje) {
  const b = $("#boton-sync");
  b.dataset.estado = e;
  $(".texto", b).textContent = TEXTO_SYNC[e] || e;
  b.title = mensaje || TEXTO_SYNC[e] || "";
  const avisos = $("#avisos");
  if (e === ESTADOS.ERROR) {
    avisos.innerHTML = `<div class="aviso alerta"><p><b>No se pudo sincronizar.</b> ${escapar(mensaje)} Tus cambios siguen guardados en este dispositivo.</p>
      <button class="boton" data-accion-app="reintentar">Reintentar</button></div>`;
  } else if (e === ESTADOS.BLOQUEADO) {
    avisos.innerHTML = `<div class="aviso alerta"><p>${escapar(mensaje || "Escribe tu contraseña de cifrado para sincronizar en este dispositivo.")}</p>
      <button class="boton primario" data-accion-app="desbloquear">Escribir contraseña</button></div>`;
  } else if (e === ESTADOS.SIN_CONFIGURAR && !preferencia("aviso-sync-oculto", false)) {
    avisos.innerHTML = `<div class="aviso"><p>Tus datos están guardados solo en este dispositivo. Conecta tu repo privado de GitHub para tenerlos también en el celular.</p>
      <button class="boton primario" data-accion-app="conectar">Conectar</button>
      <button class="boton fantasma" data-accion-app="ocultar-aviso-sync">Después</button></div>`;
  } else avisos.innerHTML = "";
  if ($("#dialogo-ajustes").open) pintarAjustesSync();
}

// ---------- toast ----------
let temporizadorToast;
function mostrarToast(texto, { deshacer = false } = {}) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${escapar(texto)}</span>${deshacer ? `<button>Deshacer</button>` : ""}`;
  if (deshacer) {
    $("button", t).onclick = () => {
      const a = tomarAnterior();
      if (a) {
        estado.datos = a;
        guardar();
        pintar();
      }
      t.remove();
    };
  }
  (document.querySelector("dialog[open]") || document.body).append(t);
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.remove(), deshacer ? 6000 : 3500);
}

ganchos.guardar = guardar;
ganchos.pintar = pintar;
ganchos.toast = mostrarToast;

// ---------- clics generales ----------
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-vista]");
  if (nav) { e.preventDefault(); cambiarVista(nav.dataset.vista); return; }
  const b = e.target.closest("[data-accion-app]");
  if (b) {
    switch (b.dataset.accionApp) {
      case "conectar": abrirConectar(); break;
      case "desbloquear": abrirDesbloquear(); break;
      case "reintentar": case "sincronizar-ya": sync.sincronizar({ interactivo: true }); break;
      case "olvidar-clave":
        if (confirm("¿Olvidar la contraseña en este dispositivo? Se pedirá otra vez al sincronizar.")) sync.olvidarContrasena();
        break;
      case "ocultar-aviso-sync": guardarPreferencia("aviso-sync-oculto", true); $("#avisos").innerHTML = ""; break;
      case "desconectar":
        if (confirm("¿Desconectar este dispositivo de GitHub? Los datos siguen aquí y en GitHub; solo deja de sincronizar.")) sync.desconectar();
        break;
      case "notificaciones":
        pedirPermisoNotificaciones().then(pintarAjustesNotificaciones);
        break;
      case "exportar-ics": exportarICS({ incluirClases: $("#ics-clases").checked }); break;
    }
  }
  if (e.target.matches("[data-cerrar]")) e.target.closest("dialog").close();
});

// Cerrar un diálogo tocando el fondo oscuro.
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  })
);

// ---------- semestres ----------
let semestreEditando = null;

$("#selector-semestre").addEventListener("change", (e) => {
  if (e.target.value === "__nuevo") {
    e.target.value = estado.datos.semestreActivo;
    abrirSemestre();
    return;
  }
  estado.datos.semestreActivo = e.target.value;
  guardar();
  pintar();
});

function abrirSemestre(idSemestre = null) {
  semestreEditando = idSemestre;
  const f = $("#form-semestre");
  f.reset();
  $("#error-semestre").textContent = "";
  const s = idSemestre ? estado.datos.semestres.find((x) => x.id === idSemestre) : null;
  $("#titulo-semestre").textContent = s ? "Renombrar semestre" : "Nuevo semestre";
  $("#copiar-materias-casilla").classList.toggle("oculto", !!s || semestre().materias.length === 0);
  $("#boton-borrar-semestre").classList.toggle("oculto", !s || estado.datos.semestres.length < 2);
  f.nombre.value = s ? s.nombre : "";
  $("#dialogo-semestre").showModal();
  f.nombre.focus();
}

$("#form-semestre").addEventListener("submit", (e) => {
  const f = e.target;
  const d = estado.datos;
  const nombre = f.nombre.value.trim();
  const repetido = d.semestres.some((s) => s.nombre.toLowerCase() === nombre.toLowerCase() && s.id !== semestreEditando);
  if (!nombre || repetido) {
    e.preventDefault();
    $("#error-semestre").textContent = nombre ? "Ya tienes un semestre con ese nombre." : "Ponle nombre.";
    return;
  }
  if (semestreEditando) d.semestres.find((s) => s.id === semestreEditando).nombre = nombre;
  else {
    const s = semestreVacio(nombre);
    if (f.copiar.checked) {
      const mapa = {};
      s.materias = semestre().materias.map((m) => {
        const nueva = { ...clonar(m), id: nuevoId(), trabajos: m.trabajos.map((t) => ({ ...t, id: nuevoId(), nota: null })) };
        mapa[m.id] = nueva.id;
        return nueva;
      });
      s.horario = (semestre().horario || []).filter((b) => mapa[b.materiaId]).map((b) => ({ ...b, id: nuevoId(), materiaId: mapa[b.materiaId] }));
    }
    d.semestres.push(s);
    d.semestreActivo = s.id;
  }
  guardar();
  pintar();
  $("#dialogo-ajustes").close();
});

$("#boton-borrar-semestre").addEventListener("click", () => {
  const d = estado.datos;
  const s = d.semestres.find((x) => x.id === semestreEditando);
  if (!s || !confirm(`¿Borrar el semestre "${s.nombre}" con todas sus materias, notas y horario?\nSus tareas pasan a la Bandeja de entrada.`)) return;
  antesDeCambio();
  d.semestres = d.semestres.filter((x) => x.id !== s.id);
  for (const t of d.tareas) if (t.destino?.tipo === "materia" && t.destino.semestreId === s.id) { t.destino = { tipo: "bandeja" }; t.evaluacion = null; }
  d.semestreActivo = d.semestres[d.semestres.length - 1].id;
  guardar({ deshacible: true });
  $("#dialogo-semestre").close();
  $("#dialogo-ajustes").close();
  pintar();
  mostrarToast(`Borraste el semestre ${s.nombre}`, { deshacer: true });
});

// ---------- ajustes ----------
$("#boton-ajustes").addEventListener("click", abrirAjustes);
$("#boton-sync").addEventListener("click", () => {
  const e = sync.estado;
  if (e === ESTADOS.SIN_CONFIGURAR) abrirConectar();
  else sync.sincronizar({ interactivo: true });
});

function abrirAjustes() {
  $("#version").textContent = VERSION;
  pintarAjustesApariencia();
  $("#nota-aprobacion").value = notaEditable(estado.datos.ajustes.notaAprobacion);
  pintarAjustesSync();
  pintarAjustesNotificaciones();
  $("#dialogo-ajustes").showModal();
}

function pintarAjustesApariencia() {
  const a = estado.datos.ajustes;
  for (const b of $("#opciones-tema").children) b.setAttribute("aria-pressed", String(b.dataset.tema === a.tema));
  $("#opciones-paleta").innerHTML = PALETAS.map(
    (p) => `<button type="button" class="paleta-opcion" data-paleta="${p.id}" aria-pressed="${p.id === a.paleta}">
      <span class="muestra" style="background:${p.color}"></span>${p.nombre}</button>`
  ).join("");
}

function pintarAjustesNotificaciones() {
  const p = estadoPermiso();
  const textos = {
    granted: "Activadas. Te aviso con la app abierta o instalada.",
    denied: "Bloqueadas en este navegador. Actívalas en los permisos del sitio. Mientras tanto, los avisos salen dentro de la app.",
    default: "Aún no las has permitido. Los avisos salen dentro de la app.",
    "no-disponible": "Este navegador no permite notificaciones; los avisos salen dentro de la app.",
  };
  $("#info-notificaciones").textContent = textos[p];
  $("#boton-notificaciones").classList.toggle("oculto", p !== "default");
}

$("#opciones-tema").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tema]");
  if (!b) return;
  estado.datos.ajustes.tema = b.dataset.tema;
  aplicarApariencia();
  pintarAjustesApariencia();
  guardar();
});

$("#opciones-paleta").addEventListener("click", (e) => {
  const b = e.target.closest("[data-paleta]");
  if (!b) return;
  estado.datos.ajustes.paleta = b.dataset.paleta;
  aplicarApariencia();
  pintarAjustesApariencia();
  guardar();
});

$("#nota-aprobacion").addEventListener("change", (e) => {
  const r = interpretarNota(e.target.value);
  if (!r.ok || r.valor === null) {
    mostrarToast("Escribe una nota entre 0 y 5.");
    e.target.value = notaEditable(estado.datos.ajustes.notaAprobacion);
    return;
  }
  estado.datos.ajustes.notaAprobacion = r.valor;
  e.target.value = notaEditable(r.valor);
  guardar();
  pintar();
});

$("#boton-renombrar-semestre").addEventListener("click", () => abrirSemestre(estado.datos.semestreActivo));
$("#boton-nuevo-semestre").addEventListener("click", () => abrirSemestre());

function pintarAjustesSync() {
  const c = sync.config;
  const info = $("#info-sync");
  const botones = $("#botones-sync");
  if (!c) {
    info.textContent = "No está conectada. Los datos viven solo en este dispositivo.";
    botones.innerHTML = `<button class="boton primario" data-accion-app="conectar">Conectar con GitHub</button>`;
    return;
  }
  const cuando = sync.ultimaSincronizacion ? new Date(sync.ultimaSincronizacion).toLocaleString("es-CO") : "aún no";
  info.innerHTML = `Conectada a <code>${escapar(c.usuario)}/${escapar(c.repo)}</code> · ${escapar(TEXTO_SYNC[sync.estado])} · última revisión: ${escapar(cuando)}`;
  botones.innerHTML = `
    <button class="boton" data-accion-app="sincronizar-ya">Sincronizar ahora</button>
    ${sync.estado === ESTADOS.BLOQUEADO ? `<button class="boton" data-accion-app="desbloquear">Escribir contraseña</button>` : ""}
    <button class="boton" data-accion-app="conectar">Cambiar conexión</button>
    <button class="boton" data-accion-app="olvidar-clave">Olvidar contraseña aquí</button>
    <button class="boton peligro" data-accion-app="desconectar">Desconectar</button>`;
}

// ---------- conectar / contraseña ----------
function abrirConectar() {
  const f = $("#form-conectar");
  const c = sync.config;
  if (c) { f.usuario.value = c.usuario; f.repo.value = c.repo; }
  $("#error-conectar").textContent = "";
  $("#dialogo-conectar").showModal();
}

$("#form-conectar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const boton = $("#boton-conectar-ok");
  boton.disabled = true;
  boton.textContent = "Probando…";
  $("#error-conectar").textContent = "";
  try {
    $("#dialogo-conectar").close();
    await sync.configurar({ usuario: f.usuario.value, repo: f.repo.value, token: f.token.value });
    f.token.value = "";
    if (sync.estado === ESTADOS.SINCRONIZADO) mostrarToast("Conectado con GitHub");
  } catch (err) {
    $("#error-conectar").textContent = err.message || String(err);
    $("#dialogo-conectar").showModal();
  } finally {
    boton.disabled = false;
    boton.textContent = "Conectar";
  }
});

// El módulo común pide la contraseña con esto: al conectar el primer dispositivo (isNew: crearla)
// o en uno nuevo (escribir la que ya tienes). Devuelve la contraseña o null si cancelas.
function pedirContrasena({ isNew }) {
  return new Promise((resolver) => {
    const dlg = $("#dialogo-desbloquear");
    const f = $("#form-desbloquear");
    f.reset();
    $("#titulo-contrasena").textContent = isNew ? "Crea una contraseña de cifrado" : "Escribe tu contraseña de cifrado";
    $("#texto-contrasena").textContent = isNew
      ? "Cifra tus datos antes de subirlos a GitHub. Usa la misma en el PC y en el celular. Si la pierdes, no se pueden recuperar."
      : "Es la contraseña con la que cifraste tus datos en tu otro dispositivo.";
    $("#repetir-contrasena").classList.toggle("oculto", !isNew);
    f.repetir.required = !!isNew;
    $("#error-desbloquear").textContent = "";
    const terminar = (valor) => {
      f.removeEventListener("submit", enviar);
      dlg.removeEventListener("close", cerrar);
      if (dlg.open) dlg.close();
      resolver(valor);
    };
    const enviar = (e) => {
      e.preventDefault();
      if (isNew && f.contrasena.value.length < 8) { $("#error-desbloquear").textContent = "Usa al menos 8 caracteres."; return; }
      if (isNew && f.contrasena.value !== f.repetir.value) { $("#error-desbloquear").textContent = "Las contraseñas no coinciden."; return; }
      terminar(f.contrasena.value);
    };
    const cerrar = () => terminar(null);
    f.addEventListener("submit", enviar);
    dlg.addEventListener("close", cerrar);
    dlg.showModal();
    f.contrasena.focus();
  });
}

function abrirDesbloquear() {
  sync.sincronizar({ interactivo: true });
}

// ---------- respaldo ----------
function descargarRespaldo(nombre = "semestre-respaldo") {
  const blob = new Blob([JSON.stringify({ app: "semestre", version: VERSION, exportado: new Date().toISOString(), datos: estado.datos }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#boton-exportar").addEventListener("click", () => descargarRespaldo());

$("#archivo-importar").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  try {
    const json = JSON.parse(await archivo.text());
    const nuevos = json.app === "semestre" ? json.datos : json;
    if (!nuevos || !Array.isArray(nuevos.semestres)) throw new Error("formato");
    if (!confirm("Esto reemplaza todos los datos actuales por los del respaldo. ¿Seguir?")) return;
    antesDeCambio();
    estado.datos = normalizar(nuevos);
    guardar({ deshacible: true });
    aplicarApariencia();
    pintar();
    $("#dialogo-ajustes").close();
    mostrarToast("Respaldo restaurado", { deshacer: true });
  } catch {
    mostrarToast("Ese archivo no es un respaldo de Semestre.");
  }
});

// ---------- arranque ----------
// Sin nada guardado se arranca vacío y solo se guarda al primer cambio
// (así, al conectar un dispositivo nuevo, manda lo que hay en GitHub).
limpiarDatosLocalesLegados();
estado.datos = normalizar(clonar(sync.datos));
aplicarApariencia();
iniciarNotas();
iniciarTareas();
iniciarCalendario();
history.replaceState(null, "", `#${vista}`);
pintar();
listo = true;
pintarEstadoSync(sync.estado, sync.mensaje);
sync.iniciar();
iniciarRecordatorios();

// Al cambiar de día con la app abierta, se repinta (Hoy / Mañana / Atrasadas).
let diaActual = new Date().toDateString();
setInterval(() => {
  if (new Date().toDateString() !== diaActual) { diaActual = new Date().toDateString(); pintar(); }
}, 60000);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
