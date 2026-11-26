// Adaptador para apps que guardan sus datos como UN documento anidado (semestre, gym, biblioteca…)
// encima del motor de registros (sync.js + merge.js + store.js).
//
// La app trabaja con su objeto de siempre. Al guardar, este módulo lo parte en registros
// ({ col, id, ... }), compara con lo que ya había y marca SOLO lo que cambió con la hora y el
// dispositivo. Al sincronizar, la mezcla es registro por registro: si en el PC cambias una tarea y
// en el celular otra, se conservan las dos (no hay "conflictos").
//
// Uso:
//   const doc = await crearDocumento({
//     app: 'semestre',                        // nombre de la base de datos local
//     aRegistros: (datos) => [...],           // documento → lista de { col, id, ...campos }
//     desdeRegistros: (registros) => datos,   // lista de registros vivos → documento
//     inicial: () => datos,                   // documento vacío (con ids fijos, para no duplicar)
//     version: '0.3.0',
//     alCambiar: ({ estado, mensaje, datosCambiaron }) => {},
//     pedirContrasena: async ({ isNew }) => 'contraseña' | null,
//   });
//   doc.datos · doc.guardar(datos) · doc.sincronizar({ interactivo }) · doc.configurar({...})
import { openStore } from './store.js';
import { createGithub } from './github.js';
import { runSync, CAP_GZ } from './sync.js';
import { SyncError } from './errors.js';

export const ESTADOS = {
  SIN_CONFIGURAR: 'sin-configurar',
  BLOQUEADO: 'bloqueado', // falta la contraseña en este dispositivo
  SINCRONIZADO: 'sincronizado',
  PENDIENTE: 'pendiente',
  SINCRONIZANDO: 'sincronizando',
  ERROR: 'error',
  SIN_CONEXION: 'sin-conexion',
};

const META = new Set(['col', 'id', 'updatedAt', 'dev', 'deleted', 'trash']);
const INTERNAS = new Set(['dispositivos', 'config']); // colecciones del motor, no del documento
const ESPERA_SUBIDA_MS = 3000;
const LIMPIAR_CADA_MS = 30 * 864e5;

const clave = (r) => `${r.col}/${r.id}`;

// JSON con las claves ordenadas: así el orden de los campos no cuenta como un cambio.
export function estable(v) {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function contenido(r) {
  const c = {};
  for (const k of Object.keys(r)) if (!META.has(k)) c[k] = r[k];
  return estable(c);
}

// Qué registros escribir para pasar de `anteriores` (mapa clave → contenido) a `nuevos`.
export function diferencias(anteriores, nuevos, { ahora, dispositivo }) {
  const cambios = [];
  const vistos = new Set();
  for (const r of nuevos) {
    const k = clave(r);
    vistos.add(k);
    if (anteriores.get(k) !== contenido(r)) cambios.push({ ...r, updatedAt: ahora, dev: dispositivo, deleted: false });
  }
  for (const k of anteriores.keys()) {
    if (vistos.has(k)) continue;
    const [col, ...resto] = k.split('/');
    cambios.push({ col, id: resto.join('/'), updatedAt: ahora, dev: dispositivo, deleted: true });
  }
  return cambios;
}

function instantanea(registros) {
  const m = new Map();
  for (const r of registros) if (!r.deleted && !INTERNAS.has(r.col)) m.set(clave(r), contenido(r));
  return m;
}

const vivos = (registros) => registros.filter((r) => !r.deleted && !INTERNAS.has(r.col));

export async function crearDocumento({
  app,
  aRegistros,
  desdeRegistros,
  inicial,
  version = '',
  alCambiar = () => {},
  pedirContrasena = async () => null,
  antesDeSincronizar = null, // migraciones del archivo remoto: ({ gh, store, dispositivo, pedirContrasena }) → nº de registros recibidos
  datosLegados = null, // () → { datos, fecha } para importar datos de una versión vieja si la base está vacía
  configLegada = null, // () → { owner, repo, branch, token } de una versión vieja
  ventana = typeof window !== 'undefined' ? window : null,
}) {
  const store = await openStore(app);
  const K_CONFIG = `${app}:sync`;

  let dispositivo = await store.getMeta('deviceId');
  if (!dispositivo) {
    dispositivo = crypto.randomUUID().slice(0, 8);
    await store.setMeta('deviceId', dispositivo);
  }

  const leerConfig = () => {
    try { return JSON.parse(localStorage.getItem(K_CONFIG)) || null; } catch { return null; }
  };
  const escribirConfig = (c) => {
    try { c ? localStorage.setItem(K_CONFIG, JSON.stringify(c)) : localStorage.removeItem(K_CONFIG); } catch {}
  };

  let registros = await store.getAllRecords();

  // Primera vez con esta versión: trae lo que hubiera guardado una versión anterior.
  if (vivos(registros).length === 0 && datosLegados) {
    const viejo = datosLegados();
    if (viejo?.datos) {
      const t = viejo.fecha || Date.now();
      await store.putRecords(aRegistros(viejo.datos).map((r) => ({ ...r, updatedAt: t, dev: dispositivo, deleted: false })));
      await store.setMeta('cambioLocal', Date.now());
      registros = await store.getAllRecords();
    }
  }
  if (!leerConfig() && configLegada) {
    const c = configLegada();
    if (c) escribirConfig(c);
  }

  let datos;
  let anteriores;
  let enStore = new Set(); // claves que ya existen en la base local (vivas o borradas)
  const cargar = (lista) => {
    enStore = new Set(lista.filter((r) => !INTERNAS.has(r.col)).map(clave));
    const v = vivos(lista);
    datos = v.length ? desdeRegistros(v) : inicial();
    // Sin nada guardado, la referencia son los valores iniciales: así un dispositivo nuevo
    // no "pisa" con sus valores por defecto lo que ya existe en los otros.
    anteriores = v.length ? instantanea(lista) : instantanea(aRegistros(inicial()));
  };
  cargar(registros);

  let estado = ESTADOS.SIN_CONFIGURAR;
  let mensaje = '';
  let temporizador = null;
  let enCurso = null;
  let escrituras = Promise.resolve();
  let cambiosDuranteSync = [];
  let ultimaSincronizacion = (await store.getMeta('lastSync')) || null;
  let cambioLocal = (await store.getMeta('cambioLocal')) || 0;
  let limpiando = false;

  const emitir = (e, m = '', extra = {}) => {
    estado = e;
    mensaje = m;
    alCambiar({ estado, mensaje, datos, datosCambiaron: false, ...extra });
  };

  const config = () => leerConfig();
  const configurado = () => {
    const c = config();
    return !!(c && c.owner && c.repo && c.token);
  };
  const reposo = () => {
    if (!configurado()) return ESTADOS.SIN_CONFIGURAR;
    if (cambioLocal > (ultimaSincronizacion || 0)) return ESTADOS.PENDIENTE;
    return ESTADOS.SINCRONIZADO;
  };

  const gh = () => {
    const c = config();
    return createGithub({ owner: c.owner, repo: c.repo, branch: c.branch || 'main', path: c.path || 'datos.enc.json', token: c.token });
  };

  // Cada dispositivo deja constancia de su versión y de que entiende el formato comprimido.
  async function registrarDispositivo() {
    const todos = await store.getAllRecords();
    const yo = todos.find((r) => r.col === 'dispositivos' && r.id === dispositivo);
    if (yo && yo.version === version && Date.now() - (yo.seenAt || 0) < 7 * 864e5) return;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Otro';
    await store.putRecords([{ col: 'dispositivos', id: dispositivo, caps: [CAP_GZ], version, name: so, seenAt: Date.now(), updatedAt: Date.now(), dev: dispositivo, deleted: false }]);
  }
  await registrarDispositivo();

  function guardar(nuevos) {
    const lista = aRegistros(nuevos);
    const cambios = diferencias(anteriores, lista, { ahora: Date.now(), dispositivo });
    // Lo que nunca se ha guardado (valores iniciales sin tocar) se guarda una vez con fecha 1:
    // así llega a los otros dispositivos, pero nunca le gana a una edición real.
    const ya = new Set(cambios.map(clave));
    for (const r of lista) {
      const k = clave(r);
      if (!enStore.has(k) && !ya.has(k)) cambios.push({ ...r, updatedAt: 1, dev: dispositivo, deleted: false });
    }
    for (const r of cambios) enStore.add(clave(r));
    datos = nuevos;
    if (!cambios.length) return escrituras;
    for (const r of cambios) {
      if (r.deleted) anteriores.delete(clave(r));
      else anteriores.set(clave(r), contenido(r));
    }
    if (enCurso) cambiosDuranteSync.push(...cambios);
    cambioLocal = Date.now();
    escrituras = escrituras.then(() => store.putRecords(cambios)).then(() => store.setMeta('cambioLocal', cambioLocal));
    if (estado !== ESTADOS.SINCRONIZANDO) emitir(reposo());
    programar();
    return escrituras;
  }

  function programar() {
    clearTimeout(temporizador);
    if (configurado()) temporizador = setTimeout(() => sincronizar(), ESPERA_SUBIDA_MS);
  }

  async function quizasLimpiar(cliente) {
    if (limpiando) return;
    const todos = await store.getAllRecords();
    const rec = todos.find((r) => r.col === 'config' && r.id === 'compactacion' && !r.deleted);
    if (rec && Date.now() - rec.at < LIMPIAR_CADA_MS) return;
    limpiando = true;
    try {
      const r = await cliente.compact({ now: Date.now() });
      if (!r.raced) {
        await store.putRecords([{ col: 'config', id: 'compactacion', at: Date.now(), before: r.before, after: r.after, updatedAt: Date.now(), dev: dispositivo, deleted: false }]);
        programar();
      }
    } catch {
      // Se intenta en otra ocasión.
    } finally {
      limpiando = false;
    }
  }

  async function sincronizar({ interactivo = false } = {}) {
    clearTimeout(temporizador);
    if (!configurado()) {
      emitir(ESTADOS.SIN_CONFIGURAR);
      return null;
    }
    if (enCurso) return enCurso;
    enCurso = (async () => {
      emitir(ESTADOS.SINCRONIZANDO);
      cambiosDuranteSync = [];
      try {
        await escrituras;
        const cliente = gh();
        const getPassphrase = async ({ isNew }) => {
          if (!interactivo) throw new SyncError('NEEDS_PASSPHRASE');
          const p = await pedirContrasena({ isNew });
          if (!p) throw new SyncError('CANCELLED');
          return p;
        };
        let recibidos = 0;
        if (antesDeSincronizar) recibidos += (await antesDeSincronizar({ gh: cliente, store, dispositivo, pedirContrasena: getPassphrase })) || 0;
        const res = await runSync({ store, gh: cliente, getPassphrase });
        recibidos += res.pulled;
        // Lo que se editó mientras se sincronizaba no debe perderse.
        if (cambiosDuranteSync.length) {
          await store.putRecords(cambiosDuranteSync);
          cambioLocal = Date.now();
          await store.setMeta('cambioLocal', cambioLocal);
        }
        ultimaSincronizacion = Date.now();
        await store.setMeta('lastSync', ultimaSincronizacion);
        if (cambiosDuranteSync.length) ultimaSincronizacion = cambioLocal - 1;
        let cambiaron = false;
        if (recibidos > 0) {
          cargar(await store.getAllRecords());
          cambiaron = true;
        }
        emitir(reposo(), '', { datosCambiaron: cambiaron });
        if (cambiosDuranteSync.length) programar();
        quizasLimpiar(cliente);
        return res;
      } catch (e) {
        if (e.code === 'NEEDS_PASSPHRASE') emitir(ESTADOS.BLOQUEADO, 'Escribe tu contraseña de cifrado para sincronizar en este dispositivo.');
        else if (e.code === 'WRONG_KEY') emitir(ESTADOS.BLOQUEADO, 'La contraseña no abre los datos guardados en GitHub.');
        else if (e.code === 'CANCELLED') {
          if (await store.getMeta('syncKey')) emitir(reposo());
          else emitir(ESTADOS.BLOQUEADO, 'Falta la contraseña de cifrado en este dispositivo.');
        }
        else if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          emitir(ESTADOS.SIN_CONEXION, 'No pude conectar con GitHub. Tus cambios quedan guardados en este dispositivo.');
        } else emitir(ESTADOS.ERROR, e.message || String(e));
        throw e;
      } finally {
        enCurso = null;
      }
    })();
    return enCurso.catch(() => null);
  }

  async function configurar({ usuario, repo, token, rama = 'main' }) {
    const previa = config();
    const nueva = { owner: usuario.trim(), repo: repo.trim(), branch: rama || 'main', path: 'datos.enc.json', token: token.trim() };
    // Si cambia el destino, la clave guardada ya no sirve.
    if (!previa || previa.owner !== nueva.owner || previa.repo !== nueva.repo) await store.delMeta('syncKey');
    escribirConfig(nueva);
    await sincronizar({ interactivo: true });
    if (estado === ESTADOS.ERROR || estado === ESTADOS.SIN_CONEXION) throw new Error(mensaje);
  }

  async function desconectar() {
    escribirConfig(null);
    await store.delMeta('syncKey');
    emitir(ESTADOS.SIN_CONFIGURAR);
  }

  async function olvidarContrasena() {
    await store.delMeta('syncKey');
    emitir(configurado() ? ESTADOS.BLOQUEADO : ESTADOS.SIN_CONFIGURAR, 'Contraseña olvidada en este dispositivo.');
  }

  if (ventana) {
    ventana.addEventListener('online', () => sincronizar());
    ventana.document?.addEventListener('visibilitychange', () => {
      if (ventana.document.visibilityState !== 'visible') return;
      if (Date.now() - (ultimaSincronizacion || 0) > 60 * 1000) sincronizar();
    });
  }

  return {
    store,
    get datos() { return datos; },
    get estado() { return estado; },
    get mensaje() { return mensaje; },
    get dispositivo() { return dispositivo; },
    get ultimaSincronizacion() { return ultimaSincronizacion; },
    get config() {
      const c = config();
      return c ? { usuario: c.owner, repo: c.repo, rama: c.branch } : null;
    },
    iniciar() {
      emitir(reposo());
      return sincronizar();
    },
    guardar,
    sincronizar,
    configurar,
    desconectar,
    olvidarContrasena,
    versiones: (pagina = 1) => gh().listVersions(pagina),
  };
}
