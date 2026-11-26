// Módulo común · sincronización cifrada con un repo privado de GitHub
// Pensado para reutilizarse en todas las apps (semestre, gym, biblioteca…).
//
// Cómo funciona:
//  - La app siempre trabaja con una copia local (localStorage), así funciona sin internet.
//  - Al guardar, se marca "pendiente" y a los pocos segundos se sube a GitHub cifrada.
//  - Al abrir la app o volver a ella, se revisa si otro dispositivo subió algo nuevo.
//  - Si los dos dispositivos cambiaron cosas a la vez, no se pisa nada: la app te
//    pregunta qué versión conservar.
//
// Uso:
//   const sync = crearSincronizador({ app: "semestre", alCambiar: ({estado, datos, mensaje}) => … });
//   sync.datos              → los datos actuales (o null)
//   sync.guardar(datos)     → guarda local y programa la subida
//   sync.sincronizar()      → fuerza una revisión
//   sync.configurar({...})  → conecta con GitHub
//   sync.resolverConflicto("local" | "remoto")

import { cifrar, descifrar, ContrasenaIncorrecta } from "./cifrado.js";
import { crearArchivoRemoto } from "./github.js";

export const ESTADOS = {
  SIN_CONFIGURAR: "sin-configurar",
  BLOQUEADO: "bloqueado", // falta la contraseña en este dispositivo
  SINCRONIZADO: "sincronizado",
  PENDIENTE: "pendiente",
  SINCRONIZANDO: "sincronizando",
  CONFLICTO: "conflicto",
  ERROR: "error",
  SIN_CONEXION: "sin-conexion",
};

const ESPERA_SUBIDA_MS = 2500;

function leerJSON(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) || "null");
  } catch {
    return null;
  }
}

function escribirJSON(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage", e);
  }
}

export function crearSincronizador({ app, archivo = "datos.enc.json", alCambiar = () => {} }) {
  const K_CONFIG = `sync:${app}:config`;
  const K_LOCAL = `sync:${app}:local`;
  const K_CLAVE = `sync:${app}:clave`;

  // local = { datos, actualizado, shaBase, pendiente }
  let local = leerJSON(K_LOCAL) || { datos: null, actualizado: null, shaBase: null, pendiente: false };
  let config = leerJSON(K_CONFIG);
  let contrasena = null;
  try {
    contrasena = localStorage.getItem(K_CLAVE) || sessionStorage.getItem(K_CLAVE);
  } catch {}

  let estado = ESTADOS.SIN_CONFIGURAR;
  let mensaje = "";
  let remotoEnConflicto = null; // { datos, sha, guardado }
  let temporizador = null;
  let enCurso = null;
  let ultimaSincronizacion = null;

  function persistirLocal() {
    escribirJSON(K_LOCAL, local);
  }

  function emitir(nuevoEstado, nuevoMensaje = "", { datosCambiaron = false } = {}) {
    estado = nuevoEstado;
    mensaje = nuevoMensaje;
    alCambiar({ estado, mensaje, datos: local.datos, datosCambiaron, conflicto: remotoEnConflicto, ultimaSincronizacion });
  }

  function remoto() {
    return crearArchivoRemoto({ usuario: config.usuario, repo: config.repo, ruta: archivo, token: config.token, rama: config.rama || "main" });
  }

  function estadoReposo() {
    if (!config) return ESTADOS.SIN_CONFIGURAR;
    if (!contrasena) return ESTADOS.BLOQUEADO;
    if (local.pendiente) return ESTADOS.PENDIENTE;
    return ESTADOS.SINCRONIZADO;
  }

  async function subir(shaBase) {
    const sobre = await cifrar({ app, guardado: local.actualizado || new Date().toISOString(), datos: local.datos }, contrasena);
    const texto = JSON.stringify(sobre);
    const sha = await remoto().escribir(texto, shaBase, `${app}: guardar datos (${new Date().toISOString()})`);
    local.shaBase = sha;
    local.pendiente = false;
    persistirLocal();
  }

  async function ciclo() {
    if (!config || !contrasena) {
      emitir(estadoReposo());
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      emitir(ESTADOS.SIN_CONEXION, "Sin conexión. Tus cambios quedan guardados en este dispositivo.");
      return;
    }
    emitir(ESTADOS.SINCRONIZANDO);
    const r = await remoto().leer();

    if (r === null) {
      // El archivo no existe todavía en GitHub.
      if (local.datos !== null) await subir(null);
      ultimaSincronizacion = new Date().toISOString();
      emitir(estadoReposo());
      return;
    }

    if (r.sha === local.shaBase) {
      if (local.pendiente) {
        try {
          await subir(local.shaBase);
        } catch (e) {
          if (e.estado === 409 || e.estado === 422) return ciclo(); // alguien subió justo ahora
          throw e;
        }
      }
      ultimaSincronizacion = new Date().toISOString();
      emitir(estadoReposo());
      return;
    }

    // GitHub tiene una versión distinta a la que conocíamos.
    const contenido = await descifrar(JSON.parse(r.texto), contrasena);
    if (!local.pendiente || local.datos === null) {
      local = { datos: contenido.datos, actualizado: contenido.guardado, shaBase: r.sha, pendiente: false };
      persistirLocal();
      ultimaSincronizacion = new Date().toISOString();
      emitir(estadoReposo(), "", { datosCambiaron: true });
      return;
    }

    // Cambios en los dos lados: preguntamos.
    remotoEnConflicto = { datos: contenido.datos, sha: r.sha, guardado: contenido.guardado };
    emitir(ESTADOS.CONFLICTO, "Hay cambios en este dispositivo y también en GitHub.");
  }

  async function sincronizar() {
    clearTimeout(temporizador);
    if (enCurso) return enCurso;
    enCurso = (async () => {
      try {
        if (estado === ESTADOS.CONFLICTO) {
          emitir(ESTADOS.CONFLICTO, mensaje);
          return;
        }
        await ciclo();
      } catch (e) {
        if (e instanceof ContrasenaIncorrecta) {
          olvidarContrasena();
          emitir(ESTADOS.BLOQUEADO, "La contraseña no abre los datos guardados en GitHub.");
        } else if (e instanceof TypeError) {
          emitir(ESTADOS.SIN_CONEXION, "No pude conectar con GitHub. Tus cambios quedan guardados en este dispositivo.");
        } else {
          emitir(ESTADOS.ERROR, e.message || String(e));
        }
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  function guardar(datos) {
    local.datos = datos;
    local.actualizado = new Date().toISOString();
    local.pendiente = true;
    persistirLocal();
    if (estado !== ESTADOS.CONFLICTO) emitir(estadoReposo());
    clearTimeout(temporizador);
    if (config && contrasena) temporizador = setTimeout(sincronizar, ESPERA_SUBIDA_MS);
  }

  async function resolverConflicto(eleccion) {
    if (!remotoEnConflicto) return;
    const r = remotoEnConflicto;
    remotoEnConflicto = null;
    if (eleccion === "remoto") {
      local = { datos: r.datos, actualizado: r.guardado, shaBase: r.sha, pendiente: false };
      persistirLocal();
      emitir(estadoReposo(), "", { datosCambiaron: true });
    } else {
      local.shaBase = r.sha;
      local.pendiente = true;
      persistirLocal();
      emitir(estadoReposo());
      await sincronizar();
    }
  }

  function guardarContrasena(nueva, recordar) {
    contrasena = nueva;
    try {
      localStorage.removeItem(K_CLAVE);
      sessionStorage.removeItem(K_CLAVE);
      (recordar ? localStorage : sessionStorage).setItem(K_CLAVE, nueva);
    } catch {}
  }

  function olvidarContrasena() {
    contrasena = null;
    try {
      localStorage.removeItem(K_CLAVE);
      sessionStorage.removeItem(K_CLAVE);
    } catch {}
  }

  // Prueba la conexión y la contraseña antes de guardar la configuración.
  async function configurar({ usuario, repo, token, rama = "main", contrasena: nueva, recordar = true }) {
    const prueba = crearArchivoRemoto({ usuario, repo, ruta: archivo, token, rama });
    const r = await prueba.leer();
    if (r) await descifrar(JSON.parse(r.texto), nueva); // lanza ContrasenaIncorrecta si no coincide
    config = { usuario: usuario.trim(), repo: repo.trim(), token: token.trim(), rama };
    escribirJSON(K_CONFIG, config);
    guardarContrasena(nueva, recordar);
    // Si había datos aquí y también en GitHub, ciclo() detecta el conflicto y pregunta.
    await sincronizar();
  }

  async function desbloquear(nueva, recordar = true) {
    if (!config) throw new Error("Primero conecta con GitHub.");
    const r = await remoto().leer();
    if (r) await descifrar(JSON.parse(r.texto), nueva);
    guardarContrasena(nueva, recordar);
    await sincronizar();
  }

  function desconectar() {
    config = null;
    escribirJSON(K_CONFIG, null);
    olvidarContrasena();
    local.shaBase = null;
    persistirLocal();
    emitir(ESTADOS.SIN_CONFIGURAR);
  }

  // Revisa cambios al volver a la app o recuperar la conexión.
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => sincronizar());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sincronizar();
    });
  }

  return {
    get datos() {
      return local.datos;
    },
    get estado() {
      return estado;
    },
    get mensaje() {
      return mensaje;
    },
    get config() {
      return config ? { usuario: config.usuario, repo: config.repo, rama: config.rama } : null;
    },
    get ultimaSincronizacion() {
      return ultimaSincronizacion;
    },
    get conflicto() {
      return remotoEnConflicto;
    },
    iniciar() {
      emitir(estadoReposo());
      return sincronizar();
    },
    guardar,
    sincronizar,
    configurar,
    desbloquear,
    desconectar,
    resolverConflicto,
    olvidarContrasena: () => {
      olvidarContrasena();
      emitir(estadoReposo());
    },
  };
}
