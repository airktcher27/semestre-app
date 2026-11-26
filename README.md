# Semestre

App web para llevar las materias, las notas y el promedio del semestre (ponderado por créditos).
Funciona en el PC y en el celular, y se sincroniza cifrada con un repo privado de GitHub, igual que la app de finanzas.

**Versión 0.1.0: Fase 1** (materias, trabajos con porcentaje, notas, créditos, promedio, tema y paletas).

## Publicarla (una sola vez)

1. **Repo de la app (público):** crea en GitHub el repo `semestre-app` y sube todo el contenido de esta carpeta a la raíz.
2. **GitHub Pages:** en `semestre-app` → *Settings → Pages* → *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
   La app queda en `https://TU-USUARIO.github.io/semestre-app/`.
3. **Repo de datos (privado):** crea `semestre-datos` como **Private**. Márcalo para crear un README, así la rama `main` existe desde el principio.
4. **Token:** *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*
   - *Repository access:* **Only select repositories** → `semestre-datos`
   - *Permissions → Repository permissions → Contents:* **Read and write**
5. Abre la app → **Conectar** → tu usuario, `semestre-datos`, el token y una **contraseña de cifrado**.
   En el celular haces lo mismo, con la **misma contraseña**.

> La contraseña cifra los datos antes de subirlos. Si la pierdes, no hay forma de abrir lo que está en GitHub
> (lo que tengas en el dispositivo sigue ahí, y puedes descargar un respaldo .json desde Ajustes).

En el celular puedes instalarla como app desde el menú del navegador: *Agregar a la pantalla principal*.

## Cómo se calcula

- **Acumulada:** suma de (nota × porcentaje). Es lo que ya llevas asegurado sobre 5,0.
- **Sobre lo evaluado:** la acumulada dividida entre el porcentaje ya calificado. Muestra cómo te va en lo que te han calificado.
- **Promedio del semestre:** el "sobre lo evaluado" de cada materia, ponderado por sus créditos. Solo cuentan las materias que ya tienen alguna nota.
- **Colores:** verde si vas en la nota para aprobar o por encima (3,0 por defecto, se cambia en Ajustes), amarillo si estás hasta 0,3 por debajo y rojo si estás más abajo.

Las notas se escriben con coma o punto (`4,5` o `4.5`). Escribir `45` también se entiende como 4,5.

## Estructura

```
index.html
css/estilos.css
js/app.js            ← la app de semestre
js/calculos.js       ← cálculos de notas (sin interfaz, probados por separado)
js/comun/            ← MÓDULO COMÚN: se copia tal cual a las demás apps
  sync.js            ← sincronización local + GitHub, detección de conflictos
  cifrado.js         ← AES-GCM 256 + PBKDF2, con compresión gzip
  github.js          ← lectura y escritura de un archivo en el repo privado
sw.js, manifest.webmanifest, img/   ← funcionamiento sin internet e instalación
```

### Usar el módulo común en otra app

```js
import { crearSincronizador } from "./comun/sync.js";
const sync = crearSincronizador({ app: "gym", alCambiar: ({ estado, datos, datosCambiaron }) => { /* repintar */ } });
sync.iniciar();
sync.guardar(misDatos); // guarda en el dispositivo y lo sube cifrado a los ~2,5 s
```

Cada app guarda su archivo `datos.enc.json` en su propio repo privado.
