# Semestre

App web para llevar las materias, las notas y el promedio del semestre (ponderado por créditos).
Funciona en el PC y en el celular, y se sincroniza cifrada con un repo privado de GitHub, igual que la app de finanzas.

**Versión 0.2.0: Fases 1 y 2**
- **Tareas:** cosas por hacer agrupadas por día (Atrasadas, Hoy, Mañana…), con fecha escrita en palabras ("viernes 3pm", "15 dic"), prioridad 1–3, recordatorio y destino: Bandeja, tus listas propias o una materia.
- **Entregas y parciales:** una tarea de una materia se puede ligar a uno de sus trabajos. Cuando pones la nota en la tarea, aparece también en Notas.
- **Calendario:** vistas de mes, semana y día, con tareas y clases. Arrastra una tarea a otro día u otra hora; toca un hueco para crear una.
- **Horario:** clases semanales por materia (salón, tipo).
- **Recordatorios:** avisan con la app abierta o instalada. Para avisos seguros, exporta un **.ics** al calendario del celular (Ajustes o Calendario).
- **Notas:** materias, trabajos con porcentaje, notas, créditos y promedio del semestre ponderado por créditos.
- Tema claro u oscuro y 7 paletas.

**Actualizar desde la 0.1.0:** reemplaza los archivos del repo `semestre-app` por los de esta carpeta. Tus datos se convierten solos al formato nuevo la primera vez que abras la app.

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
js/app.js            ← arranque, pestañas, sincronización y ajustes
js/nucleo.js         ← estado y utilidades compartidas
js/vistas/           ← pestañas: tareas.js, calendario.js, notas.js
js/componentes/      ← editor de tareas y menús flotantes
js/calculos.js       ← cálculos de notas (probados por separado)
js/fechas.js         ← fechas en español: "mañana", "viernes 3pm", "15 dic"… (probado)
js/ics.js            ← exportación a calendario (probado)
js/recordatorios.js  ← avisos
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
