# Rossmann · Frontend (Next.js)

Aplicación web en Next.js 16 (App Router), TypeScript, Tailwind CSS 4 y Recharts que **ejecuta los modelos de predicción en el navegador**, sin ningún backend:

| Modelo | Archivo | Cómo se ejecuta |
|---|---|---|
| ARIMA (SARIMAX) | `public/models/arima_<serie>.joblib` | **Pyodide** (Python en WebAssembly) dentro de un **Web Worker**: `joblib.load` → `forecast(steps, exog)` y `get_forecast(...).conf_int()` |
| GRU | `public/models/gru_<serie>.keras` | ZIP abierto con **jszip** → `config.json` (arquitectura) + `model.weights.h5` leído con **h5wasm** → **forward pass en TypeScript** |

El backend (`../rossmann-backend`) se ejecuta **una sola vez** para entrenar y exportar los artefactos a `public/`. Después, esta app funciona sola, con `npm run dev` o publicada como sitio estático: **no hay API, servidor Python ni llamadas HTTP al backend**.

## Instalación y ejecución

Requiere Node.js 20 o superior.

```bash
cd rossmann-frontend
npm install
npm run dev
```

Abre <http://localhost:3000>.

**Sitio estático** (cualquier hosting de archivos: GitHub Pages, Netlify, un bucket, `python -m http.server`…):

```bash
npm run build:estatico     # genera out/
```

> La primera vez que se usa ARIMA, el navegador descarga Pyodide y sus paquetes desde el CDN oficial (`cdn.jsdelivr.net/pyodide`): unos 30 MB que luego quedan en caché. Mientras tanto se muestra un indicador de carga. El GRU no descarga nada extra.

### Prueba: funciona sin el backend

1. Con los artefactos ya en `public/`, cierra o mueve la carpeta `rossmann-backend/`.
2. Ejecuta `npm run dev`, o `npm run build:estatico` y sirve `out/` con cualquier servidor de archivos.
3. Revisa las tres páginas:
   - **`/dashboard`** muestra las métricas y el pronóstico futuro calculado por ambos modelos. El panel **Verificación de la ejecución en el navegador** debe mostrar ✓ en ARIMA y en GRU.
   - **`/escenarios`** predice en vivo con ARIMA y GRU.
   - **`/temporal`** presenta el informe de estacionariedad.
4. En la pestaña Red del navegador solo aparecen peticiones al propio sitio (`/data`, `/models`, `/workers`) y al CDN de Pyodide.

## Compatibilidad de versiones (Pyodide ↔ backend)

`public/workers/arima-worker.mjs` usa **Pyodide 314.0.8** (Python 3.14.2), que trae numpy 2.4.6, scipy 1.18.0, pandas 3.0.2, statsmodels 0.14.6 y joblib 1.5.3. El backend entrena con **exactamente esas versiones** (`rossmann-backend/requirements.txt`), porque un `.joblib` solo se carga bien con las mismas librerías. Si cambias `PYODIDE_VERSION`, actualiza esas versiones en el backend y vuelve a entrenar.

## Validaciones automáticas

- **GRU:** al cargar cada `.keras` se ejecutan las 5 ventanas de `gru_referencia_<serie>.json` y se exige una diferencia < 1e-4 con la salida de Keras en Python. Si falla, aparece un error en pantalla.
  - Medido: **4,99e-8**.
- **ARIMA:** el dashboard pronostica el test con Pyodide y lo compara con la predicción de Python del mismo `.joblib` (`arima_meta_<serie>.json`).
  - Medido: **1,86e-9 €** en media e IC 95 %.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/` | Presentación, el modelo ganador y las series elegidas |
| `/dashboard` | Tarjetas RMSE/MAE/MAPE por modelo con el ganador resaltado y la explicación de cada métrica; real vs. ARIMA vs. GRU en el test (`metricas.json`); pronóstico futuro a 42 días calculado en vivo por ambos modelos (con la banda IC 95 % de ARIMA); tabla comparativa; verificación de la ejecución en el navegador |
| `/escenarios` | Modelo (ARIMA, GRU o **ambos superpuestos**), serie, promo, vacaciones escolares, festivo estatal y horizonte (7/14/28/42 días). Los dos modelos predicen en vivo; se muestra el escenario vs. el base, con el total, la diferencia absoluta y en % y una frase de interpretación para marketing |
| `/temporal` | Presenta `estacionalidad_informe.json`: tabla ADF/KPSS (estadístico, p-valor, valores críticos y veredicto), conclusión, diferenciación recomendada, serie histórica con zoom, STL, promedios por día y mes, ACF/PACF y efecto de las variables externas. No recalcula nada |

## Estructura

```
app/                        rutas (cada page.tsx renderiza un componente cliente)
components/
  dashboard/ escenarios/ temporal/    componentes de cada página
  EstadoModelos.tsx         indicador de carga de Pyodide y verificación de los modelos
  graficos.tsx  ui.tsx      gráficas Recharts y piezas de interfaz
lib/
  arima.ts                  cliente del Web Worker de Pyodide (ARIMA)
  keras.ts                  carga de .keras (jszip + h5wasm) y forward pass GRU/Dense en TypeScript
  gru.ts                    validación de referencia y pronóstico recursivo del GRU
  usarModelos.ts            hooks de React que ejecutan ambos modelos
  escenarios.ts             definición de escenarios (promo, vacaciones, festivo a mitad del horizonte)
  datos.ts  tipos.ts  formato.ts
public/
  workers/arima-worker.mjs  Web Worker: carga Pyodide, joblib.load y pronostica
  models/                   *.joblib y *.keras (copiados por el backend)
  data/                     *.json (copiados por el backend)
scripts/build-estatico.mjs  exportación estática (out/)
```

## Detalles del forward pass del GRU

`lib/keras.ts` reproduce la convención de Keras 3:

- **GRU con `reset_after=True`:**
  - `z = σ(x·Wz + bz + h·Uz + b'z)`
  - `r = σ(x·Wr + br + h·Ur + b'r)`
  - `ĥ = tanh(x·Wh + bh + r ⊙ (h·Uh + b'h))`
  - `h = z ⊙ h + (1 − z) ⊙ ĥ`

  Las columnas de los kernels van en orden **z, r, h**, y el bias (2, 3u) separa el bias de entrada del recurrente.
- **Dropout** es la identidad en inferencia.
- **Dense** aplica su activación (`relu` o `linear`).

Dentro de `model.weights.h5`, Keras 3 nombra las capas por clase y orden (`layers/gru`, `layers/gru_1`, `layers/dense`, `layers/dense_1`), no con el nombre del `config.json`. El cargador sigue esa misma regla.

La ventana de entrada replica `entrenar_gru.py`. El paso *k* para predecir el día *t* es `[ventas_esc(t−30+k), exógenas(t−29+k)]`, donde las exógenas son promo, vacaciones, festivo a/b/c y seno/coseno del día de la semana y del mes. La predicción se desescala con el mínimo y el máximo del `MinMaxScaler` y se encadena de forma recursiva.
