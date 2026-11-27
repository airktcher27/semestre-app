# Semestre

App web para llevar las materias, las notas y el promedio del semestre (ponderado por créditos).
Funciona en el PC y en el celular, y se sincroniza cifrada con un repo privado de GitHub, igual que la app de finanzas.

**Versión 0.4.1: las 3 fases completas**, con el módulo común de sincronización (el mismo de *Finanzas*, en `js/comun/`)
- **Historial y PAPA** (Notas → *Historial y PAPA*): PAPA, PA, créditos aprobados y cursados, promedio de cada periodo y gráfica de su evolución.
  Los semestres anteriores se agregan en bloque copiando las notas definitivas del SIA. Las materias repetidas se reconocen por su código.
- **Nota definitiva** de cada materia: se calcula sola cuando todos sus trabajos tienen nota, o la escribes tú (la del SIA manda).
  También hay materias *Aprobado/Reprobado* y canceladas.
- **Archivar** un semestre: pasa al historial y sigue siendo editable.
- **Tareas:** cosas por hacer agrupadas por día (Atrasadas, Hoy, Mañana…), con fecha escrita en palabras ("viernes 3pm", "15 dic"), prioridad 1–3, recordatorio y destino: Bandeja, tus listas propias o una materia.
- **Entregas y parciales:** una tarea de una materia se puede ligar a uno de sus trabajos. Cuando pones la nota en la tarea, aparece también en Notas.
- **Calendario:** vistas de mes, semana y día, con tareas y clases. Arrastra una tarea a otro día u otra hora; toca un hueco para crear una.
- **Horario:** clases semanales por materia (salón, tipo).
- **Recordatorios:** avisan con la app abierta o instalada. Para avisos seguros, exporta un **.ics** al calendario del celular (Ajustes o Calendario).
- **Notas:** materias, trabajos con porcentaje, notas, créditos y promedio del semestre ponderado por créditos.
- Tema automático, claro, oscuro o negro (OLED), elegido en cada dispositivo, y 7 paletas.

**Actualizar desde la 0.1 o la 0.2:** reemplaza los archivos del repo `semestre-app` por los de esta carpeta (si subes por la web,
borra antes la carpeta `js/comun/` vieja). Al abrirla, tus datos y tu conexión con GitHub pasan solos al formato nuevo; si ya
habías sincronizado, el archivo de `semestre-datos` se reescribe una vez en el formato nuevo con tu misma contraseña.
Actualiza los dos dispositivos: una versión vieja ya no entiende el archivo nuevo.

## Publicarla (una sola vez)

1. **Repo de la app (público):** crea en GitHub el repo `semestre-app` y sube todo el contenido de esta carpeta a la raíz.
2. **GitHub Pages:** en `semestre-app` → *Settings → Pages* → *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
   La app queda en `https://TU-USUARIO.github.io/semestre-app/`.
3. **Repo de datos (privado):** crea `semestre-datos` como **Private**. Márcalo para crear un README, así la rama `main` existe desde el principio.
4. **Token:** *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*
   - *Repository access:* **Only select repositories** → `semestre-datos`
   - *Permissions → Repository permissions → Contents:* **Read and write**
5. Abre la app → **Conectar** → tu usuario, `semestre-datos` y el token. Luego te pide crear una **contraseña de cifrado**.
   En el celular haces lo mismo y escribes **la misma contraseña**.

> La contraseña cifra los datos antes de subirlos. Si la pierdes, no hay forma de abrir lo que está en GitHub
> (lo que tengas en el dispositivo sigue ahí, y puedes descargar un respaldo .json desde Ajustes).
> En cada dispositivo queda guardada de forma protegida (no se puede leer), así que no se vuelve a pedir.

**Cómo se sincroniza:** cada tarea, materia, clase y lista es un registro aparte. Si cambias cosas distintas en el PC y en el
celular (aunque sea sin internet), se conservan las dos; si cambias la misma cosa, gana el cambio más reciente.
Cada sincronización queda como una versión en el repo de datos, y cada 30 días se limpia el historial viejo para que no crezca.

En el celular puedes instalarla como app desde el menú del navegador: *Agregar a la pantalla principal*.

## Cómo se calcula

- **Acumulada:** suma de (nota × porcentaje). Es lo que ya llevas asegurado sobre 5,0.
- **Sobre lo evaluado:** la acumulada dividida entre el porcentaje ya calificado. Muestra cómo te va en lo que te han calificado.
- **Promedio del semestre:** el "sobre lo evaluado" de cada materia, ponderado por sus créditos. Solo cuentan las materias que ya tienen alguna nota.
- **Colores:** verde si vas en la nota para aprobar o por encima (3,0 por defecto, se cambia en Ajustes), amarillo si estás hasta 0,3 por debajo y rojo si estás más abajo.

Las notas se escriben con coma o punto (`4,5` o `4.5`). Escribir `45` también se entiende como 4,5.

**PA y PAPA** siguen el Estatuto Estudiantil (Acuerdo 008 de 2008):
- Notas en décimas: las centésimas de 5 o más suben a la décima siguiente.
- **PA:** la última nota definitiva de cada asignatura, ponderada por créditos.
- **PAPA:** todas las notas definitivas (incluidas las de materias perdidas y repetidas), ponderadas por créditos.
- Las materias en curso, las *Aprobado/Reprobado* y las canceladas no entran en ninguno de los dos.

Para trámites, la cifra oficial es la del SIA.

## Estructura

```
index.html
css/estilos.css
js/app.js            ← arranque, pestañas, sincronización y ajustes
js/nucleo.js         ← estado y utilidades compartidas
js/vistas/           ← pestañas: tareas.js, calendario.js, notas.js, historial.js
js/componentes/      ← editor de tareas y menús flotantes
js/calculos.js       ← cálculos de notas (probados por separado)
js/fechas.js         ← fechas en español: "mañana", "viernes 3pm", "15 dic"… (probado)
js/ics.js            ← exportación a calendario (probado)
js/recordatorios.js  ← avisos
js/comun/            ← MÓDULO COMÚN (idéntico en Finanzas). Ver js/comun/LEEME.md
js/registros.js      ← cómo se parte Semestre en registros para sincronizar
js/legado.js         ← migración desde 0.1/0.2 (se puede quitar cuando todo esté en 0.3)
sw.js, manifest.webmanifest, img/   ← funcionamiento sin internet e instalación
```

### Usar el módulo común en otra app

Copia la carpeta `js/comun/` tal cual y sigue `comun/LEEME.md`.
