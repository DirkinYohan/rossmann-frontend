"use client";

import { RUTAS, useDatos } from "@/lib/datos";
import { COLOR } from "@/lib/colores";
import { pct } from "@/lib/formato";
import type { Comparacion, InfoSerie } from "@/lib/tipos";

/** Resumen de resultados en la portada: series elegidas y modelo ganador. */
export function InicioResumen() {
  const { datos, error } = useDatos<{ series: InfoSerie[]; comparacion: Comparacion }>({
    series: RUTAS.series,
    comparacion: RUTAS.comparacion,
  });
  if (error) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Aún no hay resultados en <code>public/data</code>. Ejecuta <code>python run_all.py</code> en el backend.
      </p>
    );
  }
  if (!datos) return <div className="h-40 animate-pulse rounded-xl bg-superficie" />;
  const c = datos.comparacion;
  const ganador = c.mejor_modelo_general;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="rounded-xl border border-borde bg-superficie p-5">
        <p className="text-xs uppercase tracking-wide text-tenue">Mejor modelo general (MAPE promedio)</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: ganador === "ARIMA" ? COLOR.arima : COLOR.gru }}>
          {ganador}
        </p>
        <dl className="tabular mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-tenue">ARIMA</dt>
            <dd className="font-medium">{pct(c.mape_promedio.ARIMA)}</dd>
          </div>
          <div>
            <dt className="text-tenue">GRU</dt>
            <dd className="font-medium">{pct(c.mape_promedio.GRU)}</dd>
          </div>
          <div>
            <dt className="text-tenue">Victorias ARIMA</dt>
            <dd className="font-medium">{c.victorias_por_metrica.ARIMA} / {c.tabla.length * 3}</dd>
          </div>
          <div>
            <dt className="text-tenue">Victorias GRU</dt>
            <dd className="font-medium">{c.victorias_por_metrica.GRU} / {c.tabla.length * 3}</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-xl border border-borde bg-superficie p-5">
        <p className="mb-3 text-xs uppercase tracking-wide text-tenue">Series modeladas (elegidas automáticamente)</p>
        <ul className="divide-y divide-borde text-sm">
          {datos.series.map((s) => {
            const fila = c.tabla.find((f) => f.serie === s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="font-medium">{s.nombre}</span>
                <span className="text-xs text-tenue">{s.criterio}</span>
                {fila && (
                  <span className="tabular w-full text-xs text-tenue sm:w-auto">
                    MAPE <span className="text-arima">{pct(fila.ARIMA.MAPE)}</span> · <span className="text-gru">{pct(fila.GRU.MAPE)}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
