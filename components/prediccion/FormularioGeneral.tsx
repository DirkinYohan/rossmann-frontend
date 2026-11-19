"use client";

// Paso 1 · Datos generales: serie, fecha de inicio (solo lectura), número de días y modelos.

import { SelectorSerie } from "@/components/SelectorSerie";
import { Ayuda, ErrorCampo } from "@/components/ui";
import { entero, fechaLarga, sumarDias } from "@/lib/formato";
import { HORIZONTE_MAX, HORIZONTE_MIN } from "@/lib/prediccion/validaciones";
import type { InfoSerie, InfoTienda, Modelo } from "@/lib/tipos";

const NOMBRE_TIPO: Record<string, string> = { a: "a", b: "b", c: "c", d: "d" };
const SURTIDO: Record<string, string> = { a: "Básico (a)", b: "Extra (b)", c: "Amplio (c)" };

function TarjetaTienda({ info }: { info: InfoTienda }) {
  const nd = <span className="text-tenue">No disponible</span>;
  const filas: [string, React.ReactNode, string][] = [
    ["Tipo de tienda", info.StoreType ? `Tipo ${NOMBRE_TIPO[info.StoreType] ?? info.StoreType}` : nd, "StoreType: formato de la tienda (a, b, c o d) según Rossmann."],
    ["Surtido", info.Assortment ? (SURTIDO[info.Assortment] ?? info.Assortment) : nd, "Assortment: nivel de surtido de productos (básico, extra o amplio)."],
    [
      "Competencia más cercana",
      info.CompetitionDistance != null ? `${entero(info.CompetitionDistance)} m` : nd,
      "CompetitionDistance: distancia en metros a la tienda competidora más próxima.",
    ],
    ["Promo2", info.Promo2 != null ? (info.Promo2 ? "Participa" : "No participa") : nd, "Promo2: promoción continua y recurrente en la que algunas tiendas participan."],
  ];
  const incompleta = !info.Assortment && info.CompetitionDistance == null;
  return (
    <div className="rounded-lg border border-borde bg-background p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tenue">Ficha de la tienda (solo informativa)</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {filas.map(([t, v, ayuda]) => (
          <div key={t}>
            <dt className="flex items-center gap-1 text-xs text-tenue">
              {t} <Ayuda texto={ayuda} />
            </dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {incompleta && (
        <p className="mt-2 text-xs text-tenue">
          Para completar la ficha, copia <code>store.csv</code> de Kaggle en <code>rossmann-backend/data/raw/</code> y vuelve a exportar.
        </p>
      )}
      <p className="mt-2 text-xs text-tenue">Estos datos no cambian la predicción: los modelos se entrenaron con la serie de ventas de esta tienda.</p>
    </div>
  );
}

export function FormularioGeneral({
  series,
  serie,
  onSerie,
  infoTienda,
  ultimaFecha,
  diasTexto,
  onDias,
  errorDias,
  modelos,
  onModelos,
  errorModelos,
}: {
  series: InfoSerie[];
  serie: string;
  onSerie: (id: string) => void;
  infoTienda: InfoTienda | null;
  ultimaFecha: string | null;
  diasTexto: string;
  onDias: (texto: string) => void;
  errorDias: string | null;
  modelos: Record<Modelo, boolean>;
  onModelos: (m: Record<Modelo, boolean>) => void;
  errorModelos: string | null;
}) {
  const esTienda = infoTienda && Object.keys(infoTienda).length > 0;
  return (
    <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
      <div className="space-y-3">
        <SelectorSerie etiqueta="Serie a predecir" series={series} valor={serie} onChange={onSerie} />
        {esTienda && <TarjetaTienda info={infoTienda} />}
      </div>

      <div className="grid content-start gap-5 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-tenue">Fecha de inicio</span>
          <input
            readOnly
            aria-readonly
            value={ultimaFecha ? fechaLarga(sumarDias(ultimaFecha, 1)) : "…"}
            className="w-full cursor-default rounded-lg border border-borde bg-background px-3 py-2 text-sm font-medium"
          />
          <span className="mt-1 block text-xs text-tenue">Los modelos predicen a partir del último dato disponible{ultimaFecha ? ` (${fechaLarga(ultimaFecha)})` : ""}.</span>
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-tenue">
            Número de días <Ayuda texto={`Cuántos días quieres predecir, de ${HORIZONTE_MIN} a ${HORIZONTE_MAX}. Los modelos se evaluaron a 42 días (6 semanas).`} />
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={HORIZONTE_MIN}
            max={HORIZONTE_MAX}
            step={1}
            value={diasTexto}
            onChange={(e) => onDias(e.target.value)}
            aria-invalid={Boolean(errorDias)}
            aria-describedby="error-dias"
            className={`w-full rounded-lg border bg-superficie px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-arima/40 ${
              errorDias ? "border-red-400" : "border-borde"
            }`}
          />
          <ErrorCampo id="error-dias" mensaje={errorDias} />
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-tenue">
            Modelos <Ayuda texto="ARIMA (SARIMAX) es un modelo estadístico con intervalo de confianza; GRU es una red neuronal recurrente. Puedes compararlos con el mismo formulario." />
          </legend>
          <div className="flex flex-wrap gap-4">
            {(["ARIMA", "GRU"] as Modelo[]).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modelos[m]}
                  onChange={(e) => onModelos({ ...modelos, [m]: e.target.checked })}
                  className={`h-4 w-4 rounded ${m === "ARIMA" ? "accent-arima" : "accent-gru"}`}
                />
                <span className="font-medium" style={{ color: m === "ARIMA" ? "var(--arima)" : "var(--gru)" }}>
                  {m}
                </span>
                <span className="text-xs text-tenue">{m === "ARIMA" ? "Pyodide · .joblib" : "TypeScript · .keras"}</span>
              </label>
            ))}
          </div>
          <ErrorCampo mensaje={errorModelos} />
        </fieldset>
      </div>
    </div>
  );
}
