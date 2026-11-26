// Migración desde Semestre 0.1 / 0.2 (que usaban otro formato de sincronización).
// - Datos locales: estaban en localStorage → pasan a IndexedDB.
// - Conexión con GitHub: se conserva.
// - Archivo remoto: si GitHub tiene el formato viejo, se lee una vez y se reescribe en el formato del módulo común.
// Cuando todos tus dispositivos tengan la 0.3, este archivo ya no hace nada.
import { deriveKey, encryptJson, newSalt, ITERATIONS, b64decode } from './comun/crypto.js';
import { mergeRecords } from './comun/merge.js';
import { SyncError } from './comun/errors.js';

const K_LOCAL = 'sync:semestre:local';
const K_CONFIG = 'sync:semestre:config';
const K_CLAVE = 'sync:semestre:clave';

const leer = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
};

export function datosLegados() {
  const l = leer(K_LOCAL);
  if (!l?.datos) return null;
  return { datos: l.datos, fecha: Date.parse(l.actualizado || '') || 1 };
}

export function configLegada() {
  const c = leer(K_CONFIG);
  if (!c?.usuario || !c?.repo || !c?.token) return null;
  return { owner: c.usuario, repo: c.repo, branch: c.rama || 'main', path: 'datos.enc.json', token: c.token };
}

function claveLegada() {
  try { return localStorage.getItem(K_CLAVE) || sessionStorage.getItem(K_CLAVE) || null; } catch { return null; }
}

// Los datos locales viejos ya quedaron en IndexedDB: se pueden borrar.
export function limpiarDatosLocalesLegados() {
  try { localStorage.removeItem(K_LOCAL); } catch {}
}

// Una vez migrado todo, se borra lo viejo (incluida la contraseña que 0.1/0.2 guardaban en texto).
export function limpiarLegado() {
  try {
    for (const k of [K_LOCAL, K_CONFIG, K_CLAVE]) localStorage.removeItem(k);
    sessionStorage.removeItem(K_CLAVE);
  } catch {}
}

async function descifrarViejo(sobre, contrasena) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  const clave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(sobre.sal), iterations: sobre.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  let bytes;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(sobre.iv) }, clave, b64decode(sobre.datos)));
  } catch {
    throw new SyncError('WRONG_KEY', 'La contraseña no abre los datos guardados en GitHub.');
  }
  if (sobre.gz) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Gancho para antesDeSincronizar del módulo común.
export function crearMigracionRemota({ aRegistros, normalizar }) {
  return async ({ gh, store, dispositivo, pedirContrasena }) => {
    const remoto = await gh.get();
    let sobre = null;
    try { sobre = remoto ? JSON.parse(remoto.text) : null; } catch {}
    if (!sobre || sobre.formato !== 'sobre-cifrado') {
      limpiarLegado();
      return 0;
    }
    const contrasena = claveLegada() || (await pedirContrasena({ isNew: false }));
    const contenido = await descifrarViejo(sobre, contrasena);
    const t = Date.parse(contenido.guardado || '') || 1;
    const remotos = aRegistros(normalizar(contenido.datos)).map((r) => ({ ...r, updatedAt: t, dev: dispositivo, deleted: false }));
    const locales = await store.getAllRecords();
    const { merged, toLocal } = mergeRecords(locales, remotos);
    await store.putRecords(toLocal);
    // Se reescribe en el formato nuevo con la misma contraseña.
    const sal = newSalt();
    const key = await deriveKey(contrasena, sal, ITERATIONS);
    const archivo = await encryptJson(key, sal, ITERATIONS, { records: merged, savedAt: Date.now() }, { compress: true });
    await gh.put(JSON.stringify(archivo), remoto.sha, 'semestre: paso al formato del módulo común');
    await store.setMeta('syncKey', { key, salt: sal, iter: ITERATIONS });
    limpiarLegado();
    return toLocal.length;
  };
}
