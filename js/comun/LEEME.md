# Módulo común de sincronización

La misma carpeta `comun/` va **idéntica** en todas las apps (finanzas, semestre, y las que vengan).
Si se mejora en una, se copia la carpeta entera a las demás.

## Qué hace

- **Local primero:** los datos viven en IndexedDB del dispositivo. La app funciona sin internet.
- **Cifrado de extremo a extremo:** PBKDF2-SHA256 (310 000 iteraciones) y luego AES-GCM 256. A GitHub solo sube texto cifrado.
  La clave derivada queda guardada como "no extraíble": no se pide la contraseña cada vez, pero tampoco se puede leer.
- **Mezcla registro por registro:** cada dato es un registro `{ col, id, updatedAt, dev, deleted, ...campos }`.
  Gana la modificación más reciente de cada registro, así que dos dispositivos que editan cosas distintas no chocan.
  Los borrados viajan como "lápidas" (`deleted: true`).
- **Compresión gzip** antes de cifrar, solo cuando todos los dispositivos que escriben la entienden.
- **Versiones:** cada sincronización es un commit en el repo privado. `listVersions()` las lista y `compact()` limpia el
  historial: conserva todo lo de los últimos 2 días y una versión por día hasta 90 días.

## Archivos

| Archivo | Para qué |
|---|---|
| `crypto.js` | Cifrar y descifrar (con o sin gzip) |
| `github.js` | Leer y escribir el archivo cifrado en el repo; versiones y limpieza del historial |
| `merge.js` | Mezcla de registros |
| `sync.js` | Ciclo completo: bajar → descifrar → mezclar → cifrar → subir. Respaldo cifrado manual |
| `store.js` | IndexedDB. `openStore('nombre-de-la-app')` |
| `errors.js` | Errores con código (`WRONG_KEY`, `BAD_TOKEN`, `CONFLICT`…) |
| `documento.js` | Adaptador para apps que guardan **un documento anidado** (semestre, gym…) |

## Dos formas de usarlo

**Con registros directamente** (como finanzas): la app lee y escribe registros con `store` y llama a `runSync`.

**Con un documento** (como semestre): la app trabaja con su objeto de siempre y describe cómo partirlo en registros.

```js
import { crearDocumento, ESTADOS } from './comun/documento.js';

const doc = await crearDocumento({
  app: 'gym',
  version: '0.1.0',
  inicial: () => ({ rutinas: [], sesiones: [] }),
  aRegistros: (d) => [
    ...d.rutinas.map((r, i) => ({ col: 'rutinas', id: r.id, orden: i, ...r })),
    ...d.sesiones.map((s) => ({ col: 'sesiones', ...s })),
  ],
  desdeRegistros: (regs) => ({
    rutinas: regs.filter((r) => r.col === 'rutinas').sort((a, b) => a.orden - b.orden),
    sesiones: regs.filter((r) => r.col === 'sesiones'),
  }),
  alCambiar: ({ estado, datosCambiaron }) => { /* repintar */ },
  pedirContrasena: async ({ isNew }) => prompt(isNew ? 'Crea una contraseña' : 'Contraseña'),
});

doc.guardar(nuevosDatos);  // guarda en el dispositivo y sube a GitHub a los ~3 s
```

Consejos para `aRegistros`:
- Partir en registros pequeños (una tarea, una materia, una sesión), no en uno gigante: así se mezclan mejor.
- Los valores iniciales deben tener **ids fijos** (`'general'`, `'personal'`), para que dos dispositivos nuevos no los dupliquen.
- Cada app usa **su propio repo privado** de datos (`finanzas-datos`, `semestre-datos`…).
