# Rossmann · Frontend (Next.js)

Aplicación web en Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Recharts y onnxruntime-web para visualizar los modelos de predicción de ventas que entrena `../rossmann-backend`.

**No se conecta a ningún backend en vivo.** Solo lee los archivos estáticos de `public/`:

| Carpeta | Contenido (lo genera el backend con `python run_all.py`) |
|---|---|
| `public/data/` | `series.json`, `estacionalidad.json`, `arima_escenarios.json`, `arima_resultados.json`, `gru_resultados.json`, `comparacion_metricas.json` |
| `public/models/` | `gru_<serie>.onnx` y `gru_config.json`, con el escalador, el orden de las features y los últimos 30 días |
| `public/ort/` | Los binarios WebAssembly de onnxruntime-web. Se copian solos desde `node_modules` (`scripts/copiar-ort.mjs`), así la app no depende de ningún CDN |

## Instalación y ejecución

Requiere Node.js 20 o superior.

```bash
cd rossmann-frontend
npm install
npm run dev
```

Abre <http://localhost:3000>. Para una versión de producción:

```bash
npm run build
npm start
```

> Si `public/data/` está vacío, las páginas muestran un aviso. Primero ejecuta el backend (`cd ../rossmann-backend && python run_all.py`).

## Páginas

| Ruta | Qué muestra |
|---|---|
| `/` | Presentación, el modelo ganador y las series elegidas |
| `/dashboard` | Selector de serie; tarjetas RMSE/MAE/MAPE de ARIMA y GRU lado a lado, con el mejor resaltado; real vs. ARIMA vs. GRU en el test; pronóstico a 42 días con la banda IC 95 % de ARIMA; tabla comparativa |
| `/escenarios` | Controles de modelo, serie, promo, vacaciones escolares, festivo y horizonte. **ARIMA** lee el escenario precalculado. **GRU** ejecuta el modelo ONNX en el navegador con predicción recursiva. Gráfica del escenario vs. el base, resumen (total, diferencia absoluta y %) y una frase de interpretación para marketing |
| `/temporal` | Serie histórica con zoom (Brush), descomposición STL, barras por día de la semana y por mes, ACF/PACF, pruebas ADF/KPSS con interpretación y efecto de Promo y festivos |

## Estructura

```
app/                   rutas (cada page.tsx renderiza un componente cliente)
components/
  dashboard/           DashboardCliente
  escenarios/          EscenariosCliente
  temporal/            TemporalCliente
  graficos.tsx         gráficas Recharts reutilizables
  ui.tsx               tarjetas, controles segmentados, estados de carga y error
lib/
  datos.ts             carga y caché de los JSON de public/
  gru.ts               inferencia ONNX: arma las ventanas igual que entrenar_gru.py
  escenarios.ts        definición de escenarios (igual que exportar_arima.py)
  formato.ts           números, euros y fechas en español
  tipos.ts             tipos de los JSON exportados
scripts/copiar-ort.mjs copia los .wasm de onnxruntime-web a public/ort
```

## Cómo se ejecuta el GRU en el navegador

`lib/gru.ts` carga `public/models/gru_<serie>.onnx` con `onnxruntime-web` (backend wasm, un hilo). Para predecir el día *t* arma una ventana de 30 pasos. El paso *k* contiene `[ventas_esc(t-30+k), exógenas(t-29+k)]`, donde las exógenas son promo, vacaciones, festivo a/b/c y seno/coseno del día de la semana y del mes. Cada predicción se desescala con el mínimo y el máximo del `MinMaxScaler` y se agrega a la historia para predecir el día siguiente.

Es la misma lógica que `entrenar_gru.py`. El escenario base del navegador coincide con el `futuro_base` que calcula Python con `onnxruntime`.
