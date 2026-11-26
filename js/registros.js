// Cómo se parte el documento de Semestre en registros para el módulo común (y cómo se rearma).
// Cada tarea, materia, clase del horario, lista y semestre es un registro aparte: si editas cosas
// distintas en el PC y en el celular, se conservan las dos.

const sin = (obj, ...claves) => {
  const c = { ...obj };
  for (const k of claves) delete c[k];
  return c;
};

export function aRegistros(d) {
  const r = [];
  const a = d.ajustes || {};
  r.push({ col: 'ajustes', id: 'general', notaAprobacion: a.notaAprobacion, tema: a.tema, paleta: a.paleta });
  (d.semestres || []).forEach((s, i) => {
    r.push({ ...sin(s, 'id', 'materias', 'horario'), col: 'semestres', id: s.id, orden: i });
    (s.materias || []).forEach((m, j) => r.push({ ...sin(m, 'id'), col: 'materias', id: m.id, semestreId: s.id, orden: j }));
    (s.horario || []).forEach((b) => r.push({ ...sin(b, 'id'), col: 'horario', id: b.id, semestreId: s.id }));
  });
  (d.listas || []).forEach((l, i) => r.push({ ...sin(l, 'id'), col: 'listas', id: l.id, orden: i }));
  (d.tareas || []).forEach((t) => r.push({ ...sin(t, 'id'), col: 'tareas', id: t.id }));
  return r;
}

const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.creado || a.id).localeCompare(String(b.creado || b.id));
const limpiar = (r, ...extra) => sin(r, 'col', 'updatedAt', 'dev', 'deleted', 'trash', ...extra);

export function desdeRegistros(registros) {
  const de = (col) => registros.filter((r) => r.col === col && !r.deleted);
  const ajustes = de('ajustes').find((r) => r.id === 'general');
  const semestres = de('semestres').sort(porOrden).map((s) => ({
    ...limpiar(s, 'orden'),
    materias: de('materias').filter((m) => m.semestreId === s.id).sort(porOrden).map((m) => limpiar(m, 'semestreId', 'orden')),
    horario: de('horario').filter((b) => b.semestreId === s.id).map((b) => limpiar(b, 'semestreId')),
  }));
  return {
    esquema: 2,
    ajustes: ajustes ? limpiar(ajustes, 'id') : undefined,
    semestres,
    listas: de('listas').sort(porOrden).map((l) => limpiar(l, 'orden')),
    tareas: de('tareas').map((t) => limpiar(t)),
  };
}
