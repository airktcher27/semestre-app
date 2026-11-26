// Cliente mínimo de la API de contenidos de GitHub para leer/escribir UN archivo cifrado.
import { SyncError } from './errors.js';
import { utf8ToB64, b64ToUtf8 } from './crypto.js';

export function createGithub({ owner, repo, branch = 'main', path = 'datos.enc.json', token, fetchFn }) {
  const f = fetchFn || ((...a) => fetch(...a));
  const api = 'https://api.github.com';
  const base = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const repoApi = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function ensureOk(res) {
    if (res.ok) return;
    if (res.status === 401) throw new SyncError('BAD_TOKEN', 'Token inválido o vencido.');
    if (res.status === 403) throw new SyncError('FORBIDDEN', 'GitHub rechazó la petición (permisos del token o límite de uso).');
    throw new SyncError('HTTP', `Error de GitHub (${res.status}).`);
  }

  async function checkRepo() {
    const r = await f(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers, cache: 'no-store' });
    if (r.status === 404) {
      throw new SyncError('REPO_NOT_FOUND', 'No encuentro el repositorio. Revisa usuario y nombre, y que el token tenga acceso a él.');
    }
    await ensureOk(r);
  }

  return {
    // Devuelve { sha, text } o null si el archivo todavía no existe. `ref`: rama o commit.
    async get(ref = branch) {
      const url = `${base}?ref=${encodeURIComponent(ref)}&_=${Date.now()}`;
      const res = await f(url, { headers, cache: 'no-store' });
      if (res.status === 404) {
        await checkRepo();
        return null;
      }
      await ensureOk(res);
      const j = await res.json();
      let text;
      if (j.encoding === 'base64' && j.content) {
        text = b64ToUtf8(j.content);
      } else {
        // Archivos > 1 MB: GitHub no incluye el contenido en el JSON.
        const raw = await f(url, { headers: { ...headers, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
        await ensureOk(raw);
        text = await raw.text();
      }
      return { sha: j.sha, text };
    },

    // Versiones del archivo de datos (commits que lo tocaron), de la más reciente a la más vieja.
    async listVersions(page = 1, perPage = 100) {
      const q = new URLSearchParams({ path, sha: branch, per_page: String(perPage), page: String(page) });
      const res = await f(`${repoApi}/commits?${q}`, { headers, cache: 'no-store' });
      if (res.status === 409) return []; // repositorio vacío
      await ensureOk(res);
      return (await res.json()).map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message }));
    },

    // Tamaño del repositorio en KB (GitHub lo actualiza con retraso).
    async repoSizeKB() {
      const res = await f(repoApi, { headers, cache: 'no-store' });
      await ensureOk(res);
      return (await res.json()).size;
    },

    // ¿Hay commits más viejos que `cutoffISO`? (para saber si vale la pena limpiar)
    async hasCommitsBefore(cutoffISO) {
      const q = new URLSearchParams({ sha: branch, until: cutoffISO, per_page: '1' });
      const res = await f(`${repoApi}/commits?${q}`, { headers, cache: 'no-store' });
      if (res.status === 409) return false;
      await ensureOk(res);
      return (await res.json()).length > 0;
    },

    // Limpia el historial: reescribe la rama conservando solo las versiones que elige
    // pickVersions (todas las de los últimos días + una por día hasta keepDays). Cada versión
    // conservada se recrea con su mismo contenido (árbol) y su fecha original. Si mientras tanto
    // otro dispositivo subió algo, se cancela sin tocar nada.
    async compact({ now = Date.now(), keepDays = 90, recentDays = 2, maxPages = 60, delayMs = 800 } = {}) {
      const refUrl = `${repoApi}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
      const getHead = async () => {
        const r = await f(refUrl, { headers, cache: 'no-store' });
        await ensureOk(r);
        return (await r.json()).object.sha;
      };
      const head = await getHead();
      const all = [];
      for (let page = 1; page <= maxPages; page++) {
        const q = new URLSearchParams({ sha: head, per_page: '100', page: String(page) });
        const r = await f(`${repoApi}/commits?${q}`, { headers, cache: 'no-store' });
        await ensureOk(r);
        const list = await r.json();
        for (const c of list) {
          all.push({ sha: c.sha, tree: c.commit.tree.sha, message: c.commit.message, date: c.commit.committer.date, author: c.commit.author, committer: c.commit.committer });
        }
        if (list.length < 100) break;
      }
      const keep = pickVersions(all, now, keepDays, recentDays);
      if (keep.length === all.length) return { changed: false, before: all.length, after: all.length };
      // GitHub limita a ~80 escrituras por minuto: se crean con una pausa entre una y otra.
      if (keep.length > 400) throw new SyncError('HTTP', 'Hay demasiadas versiones recientes para limpiar de una vez.');
      let parent = null;
      for (const c of [...keep].reverse()) {
        if (parent && delayMs) await new Promise((res) => setTimeout(res, delayMs));
        const body = { message: c.message, tree: c.tree, parents: parent ? [parent] : [], author: c.author, committer: c.committer };
        const r = await f(`${repoApi}/git/commits`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        await ensureOk(r);
        parent = (await r.json()).sha;
      }
      if ((await getHead()) !== head) return { changed: false, raced: true, before: all.length, after: all.length };
      const r = await f(refUrl, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: parent, force: true }) });
      await ensureOk(r);
      return { changed: true, before: all.length, after: keep.length };
    },

    async put(text, sha, message) {
      const body = { message, content: utf8ToB64(text), branch };
      if (sha) body.sha = sha;
      const res = await f(base, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) throw new SyncError('CONFLICT', 'Conflicto de versión.');
      if (res.status === 422) {
        let msg = '';
        try { msg = (await res.json()).message || ''; } catch {}
        if (/sha|match/i.test(msg)) throw new SyncError('CONFLICT', 'Conflicto de versión.');
        throw new SyncError('HTTP', `GitHub no aceptó el archivo: ${msg || '422'}. ¿Existe la rama "${branch}"?`);
      }
      if (res.status === 404) {
        throw new SyncError('REPO_NOT_FOUND', 'No pude escribir en el repositorio. Revisa que el token tenga permiso "Contents: Read and write".');
      }
      await ensureOk(res);
    },
  };
}

// Qué versiones conservar (commits ordenados del más nuevo al más viejo):
// todas las de los últimos `recentDays` días, la última de cada día hasta `keepDays`,
// y siempre la más reciente. Devuelve la lista en el mismo orden (nuevo → viejo).
export function pickVersions(commits, now, keepDays = 90, recentDays = 2) {
  const recentCut = now - recentDays * 864e5;
  const keepCut = now - keepDays * 864e5;
  const seenDays = new Set();
  const out = [];
  commits.forEach((c, i) => {
    const t = Date.parse(c.date);
    const day = new Date(t).toISOString().slice(0, 10);
    let keep = false;
    if (i === 0) keep = true;
    else if (t >= recentCut) keep = true;
    else if (t >= keepCut && !seenDays.has(day)) keep = true;
    if (keep) { seenDays.add(day); out.push(c); }
  });
  return out;
}
