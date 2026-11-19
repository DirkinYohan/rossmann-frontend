"use client";

// Indicadores de ejecución de los modelos en el navegador.
import { useEstadoPyodide } from "@/lib/arima";
import { useValidacionGru, useVerificacionArima } from "@/lib/usarModelos";

function Spinner({ color = "border-t-arima" }: { color?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-borde ${color}`} />;
}

/** Aviso de carga de Pyodide (la primera vez descarga ~30 MB y tarda unos segundos). */
export function IndicadorPyodide({ visible = true }: { visible?: boolean }) {
  const estado = useEstadoPyodide();
  if (!visible || estado.etapa === "listo" || estado.etapa === "inactivo") return null;
  if (estado.etapa === "error") {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
        Error al ejecutar ARIMA en Pyodide: {estado.mensaje}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm text-tenue" role="status">
      <Spinner />
      {estado.mensaje} <span className="text-xs">(solo la primera vez; después queda en caché)</span>
    </p>
  );
}

/** Error claro si el GRU en TypeScript no reproduce a Python. */
export function ErrorValidacionGru({ serie }: { serie: string }) {
  const v = useValidacionGru(serie);
  if (!v.error) return null;
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
      <p className="font-semibold">El modelo GRU no pasó la validación</p>
      <p className="mt-1">{v.error}</p>
    </div>
  );
}

/** Panel con las dos verificaciones: ARIMA (Pyodide vs Python) y GRU (TypeScript vs Python). */
export function VerificacionModelos({ serie }: { serie: string }) {
  const gru = useValidacionGru(serie);
  const arima = useVerificacionArima(serie, true);

  const fila = (titulo: string, detalle: string, estado: "ok" | "error" | "cargando", mensaje: string) => (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${
          estado === "ok" ? "bg-emerald-600" : estado === "error" ? "bg-red-600" : "bg-borde"
        }`}
      >
        {estado === "ok" ? "✓" : estado === "error" ? "!" : ""}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-tenue">{detalle}</p>
        <p className={`tabular mt-0.5 text-xs ${estado === "error" ? "text-red-700" : "text-foreground"}`}>
          {estado === "cargando" ? (
            <span className="inline-flex items-center gap-1.5 text-tenue">
              <Spinner /> {mensaje}
            </span>
          ) : (
            mensaje
          )}
        </p>
      </div>
    </li>
  );

  return (
    <ul className="divide-y divide-borde">
      {fila(
        "ARIMA · .joblib ejecutado con Pyodide",
        "Pronóstico de 42 días (desde el último dato, promo de lunes a viernes) en el navegador frente al calculado en Python con el mismo archivo.",
        arima.error ? "error" : arima.datos ? (arima.datos.ok ? "ok" : "error") : "cargando",
        arima.error
          ? arima.error
          : arima.datos
            ? `Diferencia máxima: ${arima.datos.maxDifAbsoluta.toExponential(2)} € (relativa ${arima.datos.maxDifRelativa.toExponential(2)}) en media e IC 95 %`
            : "Iniciando Python en el navegador…",
      )}
      {fila(
        "GRU · .keras con forward pass en TypeScript",
        "Ventanas de referencia de gru_referencia.json frente a la salida de Keras en Python (tolerancia 1e-4).",
        gru.error ? "error" : gru.datos ? "ok" : "cargando",
        gru.error ? gru.error : gru.datos ? `${gru.datos.casos} casos · diferencia máxima ${gru.datos.maxDiferencia.toExponential(2)}` : "Cargando modelo…",
      )}
    </ul>
  );
}
