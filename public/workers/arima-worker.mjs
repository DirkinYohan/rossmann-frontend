// Web Worker que ejecuta los modelos SARIMAX (.joblib) con Pyodide (Python en WebAssembly).
//
// Corre en un hilo aparte para que la interfaz no se congele mientras Pyodide arranca
// (~30 MB la primera vez; luego queda en la caché del navegador) o mientras calcula.
//
// ⚠ La versión de Pyodide fija las versiones de numpy/scipy/pandas/statsmodels/joblib del
// navegador. El backend entrena con EXACTAMENTE esas versiones (rossmann-backend/requirements.txt);
// si cambias PYODIDE_VERSION, reentrena el backend con las versiones de su pyodide-lock.json.
//
// El .joblib es el modelo REENTRENADO con la serie completa: su pronóstico empieza el día
// siguiente al último dato del dataset (ultima_fecha + 1).
//
// Protocolo de mensajes:
//   → { id, tipo: "iniciar" }
//   → { id, tipo: "precargar", serie, urlModelo }                 (descarga y carga el .joblib)
//   → { id, tipo: "pronosticar", serie, urlModelo, pasos, exog }
//   → { id, tipo: "aplicar_y_predecir", serie, urlModelo, pasos, exog,
//        historial: { fecha_inicio, y (null = día cerrado), exog } }
//   ← { tipo: "estado", etapa, mensaje }            (progreso de la carga)
//   ← { id, tipo: "ok", resultado }  |  { id, tipo: "error", mensaje }

const PYODIDE_VERSION = "314.0.8";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PAQUETES = ["numpy", "scipy", "pandas", "statsmodels", "joblib"];

const CODIGO_PYTHON = `
import warnings, numpy as np, joblib, statsmodels, pandas, scipy, sys
warnings.filterwarnings("ignore")

_modelos = {}

def cargar_modelo(serie, ruta):
    """Carga el resultado SARIMAX ajustado que exportó el backend con joblib.dump."""
    if serie not in _modelos:
        _modelos[serie] = {"base": joblib.load(ruta)}
    return int(_modelos[serie]["base"].nobs)

def _pronostico(res, pasos, exog):
    pron = res.get_forecast(int(pasos), exog=np.asarray(exog, dtype=float))
    media = np.asarray(pron.predicted_mean)
    ic = np.asarray(pron.conf_int(alpha=0.05))
    return {"media": media.tolist(), "li": ic[:, 0].tolist(), "ls": ic[:, 1].tolist()}

def pronosticar(serie, pasos, exog):
    """get_forecast(steps, exog) con IC 95 % desde el último dato del dataset."""
    return _pronostico(_modelos[serie]["base"], pasos, exog)

def aplicar_y_predecir(serie, fecha_inicio, y_hist, exog_hist, pasos, exog_fut):
    """
    Historial propio del usuario: results.apply(endog, exog) sobre el índice de fechas de
    esos días. Conserva los parámetros entrenados (no reentrena) y vuelve a filtrar con los
    datos del usuario, de modo que el estado del modelo (el punto de partida) pasa a ser el
    de su historial.

    El .joblib compacto contiene exactamente esos 30 días (ultima_fecha − 29 … ultima_fecha)
    e inicia su filtro de Kalman en el estado que el modelo completo tenía en el primero de
    ellos. Con copy_initialization=True el filtro parte de ese estado entrenado y solo
    sustituye las observaciones: con las ventas del dataset se obtiene exactamente el
    pronóstico base. (Una inicialización difusa con solo 30 datos no basta para estimar los
    hasta 18 estados de un SARIMAX estacional y produce pronósticos absurdos.)

    Los días cerrados llegan como None → NaN: el filtro de Kalman los trata como
    observaciones faltantes, no como venta 0.
    Después pronostica con get_forecast(steps=N, exog=exog_futuro).
    """
    base = _modelos[serie]["base"]
    y = np.asarray([np.nan if v is None else float(v) for v in y_hist], dtype=float)
    if len(y) != int(base.nobs):
        raise ValueError(f"El historial debe tener {int(base.nobs)} días (llegaron {len(y)})")
    indice = pandas.date_range(fecha_inicio, periods=len(y), freq="D")
    endog = pandas.Series(y, index=indice)
    X = pandas.DataFrame(np.asarray(exog_hist, dtype=float), index=indice)
    res = base.apply(endog=endog, exog=X, copy_initialization=True)
    return _pronostico(res, pasos, exog_fut)

def versiones():
    return {"python": sys.version.split()[0], "numpy": np.__version__, "scipy": scipy.__version__,
            "pandas": pandas.__version__, "statsmodels": statsmodels.__version__, "joblib": joblib.__version__}
`;

let pyodidePromesa = null;

function estado(etapa, mensaje) {
  self.postMessage({ tipo: "estado", etapa, mensaje });
}

async function obtenerPyodide() {
  if (!pyodidePromesa) {
    pyodidePromesa = (async () => {
      estado("descargando", "Descargando Python (Pyodide) en el navegador…");
      const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
      const py = await loadPyodide({ indexURL: PYODIDE_URL });
      estado("paquetes", "Instalando numpy, scipy, pandas, statsmodels y joblib…");
      await py.loadPackage(PAQUETES);
      py.runPython(CODIGO_PYTHON);
      py.FS.mkdirTree("/modelos");
      const versiones = py.globals.get("versiones")().toJs({ dict_converter: Object.fromEntries });
      estado("listo", "Python listo");
      return { py, versiones };
    })();
    pyodidePromesa.catch(() => {
      pyodidePromesa = null;
    });
  }
  return pyodidePromesa;
}

const cargados = new Set();

async function asegurarModelo(py, serie, urlModelo) {
  if (cargados.has(serie)) return;
  estado("modelo", `Cargando modelo ARIMA (${serie})…`);
  const resp = await fetch(urlModelo);
  if (!resp.ok) throw new Error(`No se encontró ${urlModelo} (HTTP ${resp.status})`);
  const ruta = `/modelos/${serie}.joblib`;
  py.FS.writeFile(ruta, new Uint8Array(await resp.arrayBuffer()));
  py.globals.get("cargar_modelo")(serie, ruta);
  cargados.add(serie);
}

async function atender(msg) {
  const { py, versiones } = await obtenerPyodide();
  if (msg.tipo === "iniciar") return { versiones };
  if (msg.tipo === "precargar") {
    await asegurarModelo(py, msg.serie, msg.urlModelo);
    estado("listo", "Python listo");
    return { cargado: true };
  }
  if (msg.tipo === "pronosticar" || msg.tipo === "aplicar_y_predecir") {
    await asegurarModelo(py, msg.serie, msg.urlModelo);
    const fn = py.globals.get(msg.tipo);
    const args =
      msg.tipo === "pronosticar"
        ? [msg.serie, msg.pasos, py.toPy(msg.exog)]
        : [msg.serie, msg.historial.fecha_inicio, py.toPy(msg.historial.y), py.toPy(msg.historial.exog), msg.pasos, py.toPy(msg.exog)];
    const proxy = fn(...args);
    try {
      return proxy.toJs({ dict_converter: Object.fromEntries });
    } finally {
      proxy.destroy();
      estado("listo", "Python listo");
    }
  }
  throw new Error(`Mensaje desconocido: ${msg.tipo}`);
}

// Cola: Pyodide es de un solo hilo, se atienden los mensajes en orden.
let cola = Promise.resolve();
self.onmessage = (evento) => {
  const msg = evento.data;
  cola = cola.then(async () => {
    try {
      self.postMessage({ id: msg.id, tipo: "ok", resultado: await atender(msg) });
    } catch (e) {
      self.postMessage({ id: msg.id, tipo: "error", mensaje: String(e && e.message ? e.message : e) });
    }
  });
};
