# Rossmann · Frontend (Next.js)

Aplicación web en Next.js 16 (App Router), TypeScript, Tailwind CSS 4 y Recharts que **ejecuta los modelos de predicción en el navegador**, sin ningún backend:

| Modelo | Archivo | Cómo se ejecuta |
|---|---|---|
| ARIMA (SARIMAX) | `public/models/arima_<serie>.joblib` | **Pyodide** (Python en WebAssembly) dentro de un **Web Worker**: `joblib.load` → `get_forecast(steps, exog)` con IC 95 %; con historial propio, `results.apply(...)` antes de pronosticar |
| GRU | `public/models/gru_<serie>.keras` | ZIP abierto con **jszip** → `config.json` (arquitectura) + `model.weights.h5` leído con **h5wasm** → **forward pass en TypeScript** |

Los dos modelos son la versión **reentrenada con la serie completa** (hasta el 31/07/2015), así que todas las predicciones empiezan el 01/08/2015, el día siguiente al último dato.

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
3. Revisa las cuatro páginas:
   - **`/dashboard`** muestra las métricas y el pronóstico futuro calculado por ambos modelos. El panel **Verificación de la ejecución en el navegador** debe mostrar ✓ en ARIMA y en GRU.
   - **`/escenarios`** predice en vivo con ARIMA y GRU.
   - **`/prediccion`** predice con tus propios datos (calendario e historial) con los dos modelos.
   - **`/temporal`** presenta el informe de estacionariedad.
4. En la pestaña Red del navegador solo aparecen peticiones al propio sitio (`/data`, `/models`, `/workers`) y al CDN de Pyodide.

## Compatibilidad de versiones (Pyodide ↔ backend)

`public/workers/arima-worker.mjs` usa **Pyodide 314.0.8** (Python 3.14.2), que trae numpy 2.4.6, scipy 1.18.0, pandas 3.0.2, statsmodels 0.14.6 y joblib 1.5.3. El backend entrena con **exactamente esas versiones** (`rossmann-backend/requirements.txt`), porque un `.joblib` solo se carga bien con las mismas librerías. Si cambias `PYODIDE_VERSION`, actualiza esas versiones en el backend y vuelve a entrenar.

## Validaciones automáticas

- **GRU:** al cargar cada `.keras` se ejecutan las 5 ventanas de `gru_referencia_<serie>.json` y se exige una diferencia < 1e-4 con la salida de Keras en Python. Si falla, aparece un error en pantalla.
  - Medido: **9,95e-8**.
- **ARIMA:** el dashboard pronostica con Pyodide los 42 días de `referencia` (promo de lunes a viernes) y los compara con la predicción de Python del mismo `.joblib` (`arima_meta_<serie>.json`).
  - Medido: **0,0 €** en media e IC 95 %.

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/` | Presentación, el modelo ganador y las series elegidas |
| `/dashboard` | Tarjetas RMSE/MAE/MAPE por modelo con el ganador resaltado y la explicación de cada métrica; real vs. ARIMA vs. GRU en el test (`metricas.json`); pronóstico futuro a 42 días calculado en vivo por ambos modelos (con la banda IC 95 % de ARIMA); tabla comparativa; verificación de la ejecución en el navegador |
| `/escenarios` | Modelo (ARIMA, GRU o **ambos superpuestos**), serie, promo, vacaciones escolares, festivo estatal y horizonte (7/14/28/42 días). Los dos modelos predicen en vivo; se muestra el escenario vs. el base, con el total, la diferencia absoluta y en % y una frase de interpretación para marketing |
| `/prediccion` | **Predicción personalizada.** Formulario en tres pasos con el que el usuario obtiene la predicción de ARIMA y GRU con sus propios datos (ver abajo) |
| `/temporal` | Presenta `estacionalidad_informe.json`: tabla ADF/KPSS (estadístico, p-valor, valores críticos y veredicto), conclusión, diferenciación recomendada, serie histórica con zoom, STL, promedios por día y mes, ACF/PACF y efecto de las variables externas. No recalcula nada |

## Predicción personalizada (`/prediccion`)

**Paso 1 · Datos generales.** Serie (Total cadena o una de las 5 tiendas; al elegir una tienda aparece su ficha `info_tienda` de solo lectura), fecha de inicio fija (`ultima_fecha + 1`), número de días (entero de 1 a 42, 14 por defecto) y modelos (ARIMA y/o GRU).

**Paso 2 · Calendario día por día.** Una fila por día con `¿Abierta?` (sí de lunes a sábado), `Promo`, `SchoolHoliday` y `StateHoliday` (Ninguno / Festivo público / Pascua / Navidad → `0`, `a`, `b`, `c`). Cada columna tiene una ayuda. Botones de llenado rápido: *Promo lunes a viernes*, *Promo todos los días*, *Quitar promociones*, *Todo vacaciones escolares* y *Restablecer*. Un día cerrado no puede tener promoción y su predicción es 0 €.

**Paso 3 · Historial reciente (opcional).** *Usar historial del dataset* (por defecto) o *Ingresar mis ventas recientes*: 30 filas (del 02/07 al 31/07/2015) con venta, abierta, Promo, SchoolHoliday y StateHoliday, botón *Pegar desde Excel* (30 valores separados por saltos de línea o tabulaciones) y *Cargar valores del dataset*.

| | Sin historial propio | Con historial propio |
|---|---|---|
| **ARIMA** | `get_forecast(N, exog)` desde el estado final del modelo | `results.apply(endog=ventas, exog=exog_hist, copy_initialization=True)` sobre las fechas de esos 30 días (conserva los parámetros, no reentrena) y luego `get_forecast(N, exog)`. Los días cerrados se pasan como `NaN` (observación faltante) |
| **GRU** | Ventana inicial = `ventana_gru` | Ventana inicial = tus 30 días, escalados con el MinMax de los metadatos. Los días cerrados se interpolan entre los días abiertos vecinos, igual que en el entrenamiento |

Se calcula también el **escenario base** (mismos días y cierres, sin promoción, vacaciones ni festivos). Los resultados incluyen la gráfica (últimos 30 días + ARIMA con IC 95 % + GRU y una línea donde empieza la predicción), tarjetas con el total por modelo, la diferencia ARIMA − GRU, la diferencia frente al base con una frase interpretativa y el MAPE de test de `metricas.json`, la tabla día a día, **Descargar CSV** (separador `;`, coma decimal) y **Nueva predicción**.

Validaciones (mensajes junto a cada campo, sin bloquear el resto del formulario): días entre 1 y 42; exactamente 30 ventas numéricas ≥ 0 sin celdas vacías y 0 en los días cerrados; al menos un modelo. El botón **Predecir** está deshabilitado mientras cargan Pyodide o el `.keras`, con una barra de progreso.

### Ejemplo de uso

1. Abre <http://localhost:3000/prediccion> y elige **Tienda 262 (tipo b, mayor volumen)**. Deja 14 días y los dos modelos.
2. En el Paso 2 pulsa **Promo lunes a viernes**.
3. Pulsa **Predecir**. Las tarjetas muestran cuánto venderían la promoción frente al escenario base según cada modelo, p. ej. *"Las promociones seleccionadas aumentarían las ventas en X € (+Y %) según ARIMA"*.
4. Para partir de tus propias ventas: en el Paso 3 elige **Ingresar mis ventas recientes**, pulsa **Cargar valores del dataset** (o **Pegar desde Excel** con tus 30 valores), edita lo que quieras y vuelve a pulsar **Predecir**.
5. **Descargar CSV** guarda la tabla de resultados; **Nueva predicción** conserva la serie y restablece el resto.

Comprobaciones hechas con esta página (Total cadena, 14 días):

- Con el historial del dataset, sin promociones y con los domingos abiertos, el total coincide exactamente con el escenario base de `/escenarios` (ARIMA 77.073.936 €, GRU 72.885.602 €).
- *Promo lunes a viernes* (con los domingos cerrados) sube la predicción: ARIMA +32,4 % y GRU +12,9 % frente al base. El informe de estacionariedad mide +80,9 % comparando días con y sin promo, pero esa cifra descriptiva mezcla el efecto del día de la semana (no hay promo en domingo, el día más flojo); los modelos aíslan el efecto de la promoción.
- Un historial propio con las ventas al 60 % baja el 1 de agosto de 6,11 M € a 3,59 M € en ARIMA y de 5,73 M € a 4,25 M € en GRU. Con las ventas del dataset cargadas como historial propio, la tienda 262 da exactamente el mismo resultado que con el historial del dataset.

## Estructura

```
app/                        rutas (cada page.tsx renderiza un componente cliente)
components/
  dashboard/ escenarios/ temporal/    componentes de cada página
  prediccion/               PrediccionCliente, FormularioGeneral, TablaCalendario, HistorialReciente, ResultadosPrediccion
  EstadoModelos.tsx         indicador de carga de Pyodide y verificación de los modelos
  graficos.tsx  ui.tsx      gráficas Recharts y piezas de interfaz
lib/
  arima.ts                  cliente del Web Worker de Pyodide (ARIMA)
  keras.ts                  carga de .keras (jszip + h5wasm) y forward pass GRU/Dense en TypeScript
  gru.ts                    validación de referencia y pronóstico recursivo del GRU
  usarModelos.ts            hooks de React que ejecutan ambos modelos
  escenarios.ts             definición de escenarios (promo, vacaciones, festivo a mitad del horizonte)
  prediccion/               construirExogenas.ts (formulario → entradas de cada modelo), validaciones.ts,
                            exportarCsv.ts y predecir.ts (orquesta ARIMA y GRU reutilizando arima.ts y gru.ts)
  datos.ts  tipos.ts  formato.ts
public/
  workers/arima-worker.mjs  Web Worker: carga Pyodide, joblib.load, pronostica y aplicar_y_predecir (historial propio)
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

**Promo como efecto multiplicativo (modelo híbrido).** El GRU trabaja con la venta *neutralizada*, `venta / (1 + β·promo)`, y su columna de promo entra en 0. La venta final de cada día es `salida_desescalada · (1 + β·promo del día)`, con `β = ajuste_promo_beta` de `gru_meta_<serie>.json`. Así la promo actúa solo sobre su propio día y una promo continua da un efecto estable: por ejemplo, ~+34 % por semana en el total de la cadena. Antes el efecto se desvanecía o se invertía después de dos semanas. El historial propio de `/prediccion` se neutraliza con el mismo β.
