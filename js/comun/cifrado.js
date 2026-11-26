// Módulo común · cifrado
// AES-GCM 256 con clave derivada por PBKDF2-SHA256 a partir de tu contraseña.
// Los datos se comprimen con gzip antes de cifrarse (menos peso en GitHub).
// Formato del sobre cifrado (JSON):
//   { formato: "sobre-cifrado", v: 1, kdf: "PBKDF2-SHA256", iter, sal, iv, gz, datos }

const ITERACIONES = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function aBase64(bytes) {
  let s = "";
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + trozo));
  }
  return btoa(s);
}

function deBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function transformar(bytes, Clase) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new Clase("gzip"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

const hayCompresion = typeof CompressionStream !== "undefined";

async function derivarClave(contrasena, sal, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(contrasena), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: sal, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function cifrar(objeto, contrasena) {
  let bytes = enc.encode(JSON.stringify(objeto));
  const gz = hayCompresion;
  if (gz) bytes = await transformar(bytes, CompressionStream);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClave(contrasena, sal, ITERACIONES);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, bytes));
  return {
    formato: "sobre-cifrado",
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: ITERACIONES,
    sal: aBase64(sal),
    iv: aBase64(iv),
    gz,
    datos: aBase64(cifrado),
  };
}

export class ContrasenaIncorrecta extends Error {
  constructor() {
    super("La contraseña no abre estos datos.");
    this.name = "ContrasenaIncorrecta";
  }
}

export async function descifrar(sobre, contrasena) {
  if (!sobre || sobre.formato !== "sobre-cifrado") throw new Error("El archivo remoto no tiene el formato esperado.");
  const clave = await derivarClave(contrasena, deBase64(sobre.sal), sobre.iter);
  let bytes;
  try {
    bytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(sobre.iv) }, clave, deBase64(sobre.datos))
    );
  } catch {
    throw new ContrasenaIncorrecta();
  }
  if (sobre.gz) bytes = await transformar(bytes, DecompressionStream);
  return JSON.parse(dec.decode(bytes));
}

export const utiles = { aBase64, deBase64 };
