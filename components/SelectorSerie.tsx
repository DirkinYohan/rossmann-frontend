"use client";

import type { InfoSerie } from "@/lib/tipos";

/** Selector de la serie a analizar: Total cadena + 5 tiendas representativas. */
export function SelectorSerie({
  series,
  valor,
  onChange,
  etiqueta = "Serie",
}: {
  series: InfoSerie[];
  valor: string;
  onChange: (id: string) => void;
  etiqueta?: string;
}) {
  const actual = series.find((s) => s.id === valor);
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-tenue">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-arima/40 sm:w-80"
      >
        {series.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
      {actual && <span className="mt-1 block text-xs text-tenue">{actual.criterio}</span>}
    </label>
  );
}
