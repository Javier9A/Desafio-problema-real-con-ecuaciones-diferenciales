# SportLift 🏋️

Nombre: Javier Averanga Quelka

Simulación y análisis de la evolución de la fuerza en **powerlifting** (sentadilla, press de banca y peso muerto) con una **EDO de primer orden**, su **solución analítica** y los métodos numéricos de **Heun (RK2)** y **Runge-Kutta de 4.º orden (RK4)**.

> Proyecto del *Desafío EDO* de Métodos Numéricos · UMSA, Informática · Autor: Javier Averanga Quelka
> **Aplicación publicada:** `https://TU-USUARIO.github.io/sportlift/` (reemplaza tras publicar)

⚠️ **Los parámetros son hipotéticos.** Es un modelo didáctico: no es una predicción fisiológica comprobada ni un plan de entrenamiento.

## El problema
**Comunidad:** personas que practican powerlifting (clubes, gimnasios universitarios, entrenadores).
**Pregunta:** ¿en cuántas semanas llegaría un deportista a su meta de 1RM según un modelo sencillo y qué tan precisas son las aproximaciones de Heun y RK4?
**Meta cuantificable:** hallar la semana *t\** con y(t\*) = meta y comparar errores numéricos.

## El modelo
```
dy/dt = k·I·(M − y) − δ·y = c − λ·y ,   y(0) = y₀
y(t)  = y_eq + (y₀ − y_eq)·e^(−λt) ,    λ = k·I + δ ,  y_eq = k·I·M / λ
```
| Símbolo | Significado | Unidad |
|---|---|---|
| t | tiempo | semanas |
| y | fuerza máxima (1RM) | kg |
| y₀ | marca inicial | kg |
| M | techo hipotético | kg |
| k | tasa de adaptación (hipotética) | 1/semana |
| δ | pérdida por fatiga/destrenamiento (hipotética) | 1/semana |
| I | (adherencia/100)·min(sesiones,6)/6 | adimensional |
| h | paso numérico | semanas |

Demostración por sustitución, métodos y limitaciones: [`docs/MODELO.md`](docs/MODELO.md) (también en la pestaña **Modelo** de la app).

## Funciones
- Base de datos local persistente (IndexedDB, con respaldo en localStorage): deportistas, marcas, metas, parámetros e historial. Exportar/importar JSON.
- Edición de y₀, parámetros, T y dos pasos h₁, h₂.
- Tabla por iteraciones, gráfica con las tres soluciones, errores absoluto y relativo %, comparación entre pasos y estudio de convergencia (orden observado ≈ 2 y ≈ 4).
- Validación de entradas, avisos de estabilidad (h·λ), unidades, interpretación y conclusiones automáticas.
- Diseño responsivo, tema claro/oscuro, sin dependencias ni compilación.

## Ejecutar localmente
No requiere instalación: abre `index.html` en el navegador. Para un servidor local:
```bash
python3 -m http.server 8000      # o: npm start
# abrir http://localhost:8000
node tests/ode.test.js           # pruebas del núcleo matemático (o: npm test)
```

## Publicar en GitHub Pages
```bash
git init && git add . && git commit -m "SportLift: simulación EDO con Heun y RK4"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/sportlift.git
git push -u origin main
```
En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. El workflow `.github/workflows/pages.yml` ejecuta las pruebas y despliega. (Alternativa: Source = *Deploy from a branch*, rama `main`, carpeta `/ (root)`.)

## Estructura
```
index.html          Interfaz (5 vistas)
css/styles.css      Estilos responsivos, tema claro/oscuro
js/ode.js           Modelo, solución analítica, Heun, RK4, errores, validación
js/db.js            Base de datos persistente (IndexedDB / localStorage)
js/chart.js         Gráficas SVG sin librerías
js/app.js           Lógica de la interfaz
tests/ode.test.js   16 pruebas (orden de convergencia, sustitución, etc.)
docs/MODELO.md      Documento del modelo
```
Licencia MIT.
