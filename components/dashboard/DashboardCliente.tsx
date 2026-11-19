"use client";

import { useMemo, useState } from "react";
import { GraficoPronostico, GraficoTest } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Leyenda, Panel } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { entero, euros, fechaLarga, pct } from "@/lib/formato";
import type { ArimaEscenarios, Comparacion, GruResultados, InfoSerie, Modelo, NombreMetrica } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; arima: ArimaEscenarios; gru: GruResultados; comparacion: Comparacion };

const DESCRIPCION_METRICA: Record<NombreMetrica, string> = {
  RMSE: "Raíz del error cuadrático medio. Penaliza los errores grandes.",
  MAE: "Error absoluto medio: cuántos euros se equivoca en promedio por día.",
  MAPE: "Error porcentual medio (solo días abiertos).",
};

function formatoMetrica(m: NombreMetrica, v: number) {
  return m === "MAPE" ? pct(v) : euros(v);
}

function TarjetaMetrica({ metrica, arima, gru, mejor }: { metrica: NombreMetrica; arima: number; gru: number; mejor: Modelo }) {
  const mejora = Math.abs(arima - gru) / Math.max(arima, gru) * 100;
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{metrica}</h3>
        <span className="text-xs text-tenue">menor es mejor</span>
      </div>
      <p className="mt-0.5 text-xs text-tenue">{DESCRIPCION_METRICA[metrica]}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["ARIMA", "GRU"] as const).map((mod) => {
          const gana = mod === mejor;
          const color = mod === "ARIMA" ? COLOR.arima : COLOR.gru;
          return (
            <div
              key={mod}
              className={`rounded-lg p-3 ${gana ? "ring-2" : "bg-background"}`}
              style={gana ? { boxShadow: `inset 0 0 0 2px ${color}`, background: `${color}0d` } : undefined}
            >
              <div className="flex items-center justify-between text-xs font-medium" style={{ color }}>
                {mod}
                {gana && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: color }}>Mejor</span>}
              </div>
              <p className="tabular mt-1 text-lg font-semibold tracking-tight sm:text-xl">{formatoMetrica(metrica, mod === "ARIMA" ? arima : gru)}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-tenue">{mejor} reduce el {metrica} un {mejora.toFixed(1).replace(".", ",")} % frente al otro modelo.</p>
    </div>
  );
}

export function DashboardCliente() {
  const { datos, error, cargando } = useDatos<Datos>({
    series: RUTAS.series,
    arima: RUTAS.arima,
    gru: RUTAS.gru,
    comparacion: RUTAS.comparacion,
  });
  const [serie, setSerie] = useState("total");

  const vista = useMemo(() => {
    if (!datos) return null;
    const a = datos.arima.series[serie];
    const g = datos.gru.series[serie];
    const fila = datos.comparacion.tabla.find((f) => f.serie === serie)!;

    const test = a.test.map((p, i) => ({
      fecha: p.fecha,
      real: p.abierto ? p.real : null, // días interpolados (cierres) no se muestran como "real"
      arima: p.pred,
      gru: g.test[i]?.pred ?? null,
    }));

    const base = a.escenarios["sin_no_no"];
    const futuro = [
      ...a.test.map((p) => ({ fecha: p.fecha, real: p.abierto ? p.real : null })),
      ...base.map((p, i) => ({
        fecha: p.fecha,
        arima: p.pred,
        banda: [p.li ?? p.pred, p.ls ?? p.pred] as [number, number],
        gru: g.futuro_base[i]?.pred ?? null,
      })),
    ];
    const totalArima = base.reduce((s, p) => s + p.pred, 0);
    const totalGru = g.futuro_base.reduce((s, p) => s + p.pred, 0);
    return { a, g, fila, test, futuro, totalArima, totalGru, inicioFuturo: base[0].fecha };
  }, [datos, serie]);

  if (cargando) return <Cargando />;
  if (error || !datos || !vista) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;
  const { a, fila } = vista;

  return (
    <>
      <Encabezado titulo="Dashboard de predicción">
        Comparación de SARIMAX y GRU en el periodo de prueba (últimos 42 días, {fechaLarga(fila.test_inicio)} – {fechaLarga(fila.test_fin)}) y pronóstico de las próximas 6 semanas.
      </Encabezado>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <SelectorSerie series={datos.series} valor={serie} onChange={setSerie} />
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-superficie px-2.5 py-1.5 ring-1 ring-borde">
            ARIMA: SARIMAX({a.orden.join(",")})({a.orden_estacional.join(",")})
          </span>
          <span className="rounded-md bg-superficie px-2.5 py-1.5 ring-1 ring-borde">
            GRU: {entero(vista.g.parametros)} parámetros · {vista.g.mejor_epoca} épocas
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(["RMSE", "MAE", "MAPE"] as const).map((m) => (
          <TarjetaMetrica key={m} metrica={m} arima={fila.ARIMA[m]} gru={fila.GRU[m]} mejor={fila.mejor[m]} />
        ))}
      </div>

      <div className="grid gap-6">
        <Panel
          titulo="Ventas reales vs. predicción en el periodo de test"
          descripcion="Pronóstico a 42 días de ambos modelos, entrenados solo con datos anteriores al test. GRU predice de forma recursiva."
          accion={<Leyenda items={[{ color: COLOR.real, texto: "Real" }, { color: COLOR.arima, texto: "ARIMA" }, { color: COLOR.gru, texto: "GRU" }]} />}
        >
          <GraficoTest datos={vista.test} />
        </Panel>

        <Panel
          titulo="Pronóstico futuro a 42 días"
          descripcion={
            <>
              Escenario de referencia: sin promoción, sin vacaciones escolares y sin festivos. Venta total proyectada:{" "}
              <b className="text-arima">{euros(vista.totalArima)}</b> (ARIMA) y <b className="text-gru">{euros(vista.totalGru)}</b> (GRU).
            </>
          }
          accion={
            <Leyenda
              items={[
                { color: COLOR.real, texto: "Real (últimas 6 semanas)" },
                { color: COLOR.arima, texto: "ARIMA" },
                { color: COLOR.arima, texto: "IC 95 % ARIMA", tipo: "banda" },
                { color: COLOR.gru, texto: "GRU" },
              ]}
            />
          }
        >
          <GraficoPronostico datos={vista.futuro} inicioFuturo={vista.inicioFuturo} />
        </Panel>

        <Panel
          titulo="Tabla comparativa de métricas"
          descripcion={`Mismo periodo de test para ambos modelos. MAPE promedio: ARIMA ${pct(datos.comparacion.mape_promedio.ARIMA)} · GRU ${pct(datos.comparacion.mape_promedio.GRU)}.`}
        >
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="tabular w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-tenue">
                  <th className="px-4 py-2 font-medium sm:pl-0">Serie</th>
                  {(["RMSE", "MAE", "MAPE"] as const).map((m) => (
                    <th key={m} colSpan={2} className="px-2 py-2 text-center font-medium">{m}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Mejor</th>
                </tr>
                <tr className="border-b border-borde text-xs text-tenue">
                  <th />
                  {(["RMSE", "MAE", "MAPE"] as const).flatMap((m) => [
                    <th key={`${m}a`} className="px-2 py-1 text-right font-medium text-arima">ARIMA</th>,
                    <th key={`${m}g`} className="px-2 py-1 text-right font-medium text-gru">GRU</th>,
                  ])}
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.comparacion.tabla.map((f) => (
                  <tr
                    key={f.serie}
                    onClick={() => setSerie(f.serie)}
                    className={`cursor-pointer border-b border-borde last:border-0 hover:bg-background ${f.serie === serie ? "bg-background" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium sm:pl-0">{f.nombre}</td>
                    {(["RMSE", "MAE", "MAPE"] as const).flatMap((m) =>
                      (["ARIMA", "GRU"] as const).map((mod) => (
                        <td key={m + mod} className={`px-2 py-2.5 text-right ${f.mejor[m] === mod ? "font-semibold" : "text-tenue"}`}>
                          {m === "MAPE" ? pct(f[mod][m]) : entero(f[mod][m])}
                        </td>
                      )),
                    )}
                    <td className="px-2 py-2.5 text-right">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ background: f.mejor_global === "ARIMA" ? COLOR.arima : COLOR.gru }}
                      >
                        {f.mejor_global}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-tenue">En negrita, el mejor valor de cada métrica. Haz clic en una fila para ver esa serie.</p>
        </Panel>
      </div>
    </>
  );
}
