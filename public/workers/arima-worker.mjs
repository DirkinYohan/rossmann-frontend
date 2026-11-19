// Web Worker que ejecuta los modelos SARIMAX (.joblib) con Pyodide (Python en WebAssembly).
//
// Corre en un hilo aparte para que la interfaz no se congele mientras Pyodide arranca
// (~30 MB la primera vez; luego queda en la caché del navegador) o mientras calcula.
//
// ⚠ La versión de Pyodide fija las versiones de numpy/scipy/pandas/statsmodels/joblib del
// navegador. El backend entrena con EXACTAMENTE esas versiones (rossmann-backend/requirements.txt);
// si cambias PYODIDE_VERSION, reentrena el backend con las versiones de su pyodide-lock.json.
//
// Protocolo de mensajes:
//   → { id, tipo: "iniciar" }
//   → { id, tipo: "pronosticar", serie, urlModelo, pasos, exog, extension?: { y, exog } }
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

def pronosticar(serie, pasos, exog, ext_y=None, ext_exog=None):
    """
    forecast(steps, exog) + get_forecast(...).conf_int() con las exógenas del escenario.
    Si se pasa una extensión (los 42 días de test), primero se lleva el estado del modelo
    hasta el último dato real con extend(): conserva los parámetros, no reentrena.
    """
    m = _modelos[serie]
    res = m["base"]
    if ext_y is not None:
        if "extendido" not in m:
            m["extendido"] = res.extend(np.asarray(ext_y, dtype=float), exog=np.asarray(ext_exog, dtype=float))
        res = m["extendido"]
    X = np.asarray(exog, dtype=float)
    media = np.asarray(res.forecast(int(pasos), exog=X))
    ic = np.asarray(res.get_forecast(int(pasos), exog=X).conf_int(alpha=0.05))
    return {"media": media.tolist(), "li": ic[:, 0].tolist(), "ls": ic[:, 1].tolist()}

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
  if (msg.tipo === "pronosticar") {
    await asegurarModelo(py, msg.serie, msg.urlModelo);
    const fn = py.globals.get("pronosticar");
    const args = [msg.serie, msg.pasos, py.toPy(msg.exog)];
    if (msg.extension) args.push(py.toPy(msg.extension.y), py.toPy(msg.extension.exog));
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
