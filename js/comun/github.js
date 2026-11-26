// Módulo común · acceso a un archivo dentro de un repo (privado) de GitHub
// Usa la API de contenidos con un token "fine-grained" que solo tenga
// permiso de Contents (lectura y escritura) sobre el repo de datos.

const API = "https://api.github.com";

export class ErrorGitHub extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.name = "ErrorGitHub";
    this.estado = estado;
  }
}

function utf8aB64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64aUtf8(b64) {
  const s = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function explicar(estado, cuerpo) {
  if (estado === 401) return "El token no es válido o ya venció.";
  if (estado === 403) return "El token no tiene permiso de escritura sobre el repo (o se agotó el límite de la API).";
  if (estado === 404) return "No encuentro el repo. Revisa usuario, nombre del repo y que el token tenga acceso a él.";
  if (estado === 409) return "El archivo cambió en GitHub mientras guardabas.";
  if (estado === 422) return "GitHub rechazó el cambio (probablemente el archivo cambió desde otro dispositivo).";
  return `GitHub respondió ${estado}${cuerpo?.message ? `: ${cuerpo.message}` : ""}`;
}

export function crearArchivoRemoto({ usuario, repo, ruta, token, rama = "main" }) {
  const url = `${API}/repos/${encodeURIComponent(usuario)}/${encodeURIComponent(repo)}/contents/${ruta
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const cabeceras = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  return {
    // Devuelve { texto, sha } o null si el archivo aún no existe.
    async leer() {
      const r = await fetch(`${url}?ref=${encodeURIComponent(rama)}&t=${Date.now()}`, { headers: cabeceras, cache: "no-store" });
      if (r.status === 404) {
        // ¿No existe el archivo o no existe el repo? Lo distinguimos.
        const rr = await fetch(`${API}/repos/${encodeURIComponent(usuario)}/${encodeURIComponent(repo)}`, { headers: cabeceras });
        if (rr.status === 404) throw new ErrorGitHub(explicar(404), 404);
        return null;
      }
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErrorGitHub(explicar(r.status, cuerpo), r.status);
      return { texto: b64aUtf8(cuerpo.content || ""), sha: cuerpo.sha };
    },

    // Escribe el archivo. shaAnterior = null para crearlo. Devuelve el sha nuevo.
    async escribir(texto, shaAnterior, mensaje) {
      const cuerpoPeticion = { message: mensaje, content: utf8aB64(texto), branch: rama };
      if (shaAnterior) cuerpoPeticion.sha = shaAnterior;
      const r = await fetch(url, { method: "PUT", headers: cabeceras, body: JSON.stringify(cuerpoPeticion) });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErrorGitHub(explicar(r.status, cuerpo), r.status);
      return cuerpo.content.sha;
    },
  };
}
