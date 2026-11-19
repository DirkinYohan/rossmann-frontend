"use client";

import { useMemo, useState } from "react";
import { ErrorValidacionGru, IndicadorPyodide, VerificacionModelos } from "@/components/EstadoModelos";
import { GraficoPronostico, GraficoTest } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Leyenda, Panel } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { ESCENARIO_BASE } from "@/lib/escenarios";
import { entero, euros, fechaLarga, pct } from "@/lib/formato";
import { usePronostico } from "@/lib/usarModelos";
import type { InfoSerie, MetricasJson, Modelo, NombreMetrica } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; metricas: MetricasJson };
const METRICAS: NombreMetrica[] = ["RMSE", "MAE", "MAPE"];
const BASE_42 = ESCENARIO_BASE(42);

function formatoMetrica(m: NombreMetrica, v: number) {
  return m === "MAPE" ? pct(v) : euros(v);
}

function TarjetaMetrica({ metrica, descripcion, arima, gru, mejor }: { metrica: NombreMetrica; descripcion: string; arima: number; gru: number; mejor: Modelo }) {
  const mejora = (Math.abs(arima - gru) / Math.max(arima, gru)) * 100;
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{metrica}</h3>
        <span className="text-xs text-tenue">menor es mejor</span>
      </div>
      <p className="mt-0.5 text-xs text-tenue">{descripcion}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["ARIMA", "GRU"] as const).map((mod) => {
          const gana = mod === mejor;
          const color = mod === "ARIMA" ? COLOR.arima : COLOR.gru;
          return (
            <div
              key={mod}
              className={`rounded-lg p-3 ${gana ? "" : "bg-background"}`}
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
  const { datos, error, cargando } = useDatos<Datos>({ series: RUTAS.series, metricas: RUTAS.metricas });
  const [serie, setSerie] = useState("total_cadena");

  // Pronóstico futuro calculado EN EL NAVEGADOR por ambos modelos (escenario base).
  const futArima = usePronostico("ARIMA", serie, datos ? BASE_42 : null);
  const futGru = usePronostico("GRU", serie, datos ? BASE_42 : null);

  const vista = useMemo(() => {
    if (!datos) return null;
    const s = datos.metricas.series[serie];
    const test = s.test.map((p) => ({ fecha: p.fecha, real: p.abierto ? p.real : null, arima: p.arima, gru: p.gru }));
    const ultima = s.test[s.test.length - 1].fecha;
    const fechasFut = (futArima.datos ?? futGru.datos ?? []).map((p) => p.fecha);
    const futuro = [
      ...s.test.map((p) => ({ fecha: p.fecha, real: p.abierto ? p.real : null })),
      ...fechasFut.map((fecha, i) => {
        const a = futArima.datos?.[i];
        return {
          fecha,
          arima: a?.pred ?? null,
          banda: a ? ([a.li ?? a.pred, a.ls ?? a.pred] as [number, number]) : undefined,
          gru: futGru.datos?.[i]?.pred ?? null,
        };
      }),
    ];
    const total = (xs: { pred: number }[] | null) => (xs ? xs.reduce((acc, p) => acc + p.pred, 0) : null);
    return { s, test, futuro, ultima, totalArima: total(futArima.datos), totalGru: total(futGru.datos) };
  }, [datos, serie, futArima.datos, futGru.datos]);

  if (cargando) return <Cargando />;
  if (error || !datos || !vista) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;
  const { s } = vista;
  const desc = datos.metricas.descripcion_metricas;

  return (
    <>
      <Encabezado titulo="Dashboard de predicción">
        Métricas de SARIMAX y GRU sobre el mismo periodo de test (últimos 42 días, {fechaLarga(s.test_inicio)} – {fechaLarga(s.test_fin)}) y pronóstico de las próximas 6 semanas,
        calculado en tu navegador por los propios modelos.
      </Encabezado>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <SelectorSerie series={datos.series} valor={serie} onChange={setSerie} />
        <span className="text-xs text-tenue">Haz clic en una fila de la tabla para cambiar de serie.</span>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {METRICAS.map((m) => (
          <TarjetaMetrica key={m} metrica={m} descripcion={desc[m]} arima={s.ARIMA[m]} gru={s.GRU[m]} mejor={s.mejor[m]} />
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
              <b className="text-arima">{vista.totalArima !== null ? euros(vista.totalArima) : "calculando…"}</b> (ARIMA) y{" "}
              <b className="text-gru">{vista.totalGru !== null ? euros(vista.totalGru) : "calculando…"}</b> (GRU).
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
          <div className="mb-3 space-y-2">
            <IndicadorPyodide visible={futArima.cargando} />
            {futArima.error && <ErrorDatos mensaje={futArima.error} />}
            <ErrorValidacionGru serie={serie} />
          </div>
          <GraficoPronostico datos={vista.futuro} inicioFuturo={vista.futuro[s.test.length]?.fecha} />
        </Panel>

        <Panel
          titulo="Tabla comparativa de métricas"
          descripcion={`Mismo periodo de test para ambos modelos. MAPE promedio: ARIMA ${pct(datos.metricas.mape_promedio.ARIMA)} · GRU ${pct(datos.metricas.mape_promedio.GRU)}.`}
        >
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="tabular w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-tenue">
                  <th className="px-4 py-2 font-medium sm:pl-0">Serie</th>
                  {METRICAS.map((m) => (
                    <th key={m} colSpan={2} className="px-2 py-2 text-center font-medium">{m}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Mejor</th>
                </tr>
                <tr className="border-b border-borde text-xs text-tenue">
                  <th />
                  {METRICAS.flatMap((m) => [
                    <th key={`${m}a`} className="px-2 py-1 text-right font-medium text-arima">ARIMA</th>,
                    <th key={`${m}g`} className="px-2 py-1 text-right font-medium text-gru">GRU</th>,
                  ])}
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.metricas.tabla.map((f) => (
                  <tr
                    key={f.serie}
                    onClick={() => setSerie(f.serie)}
                    className={`cursor-pointer border-b border-borde last:border-0 hover:bg-background ${f.serie === serie ? "bg-background" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium sm:pl-0">{f.nombre}</td>
                    {METRICAS.flatMap((m) =>
                      (["ARIMA", "GRU"] as const).map((mod) => (
                        <td key={m + mod} className={`px-2 py-2.5 text-right ${f.mejor[m] === mod ? "font-semibold" : "text-tenue"}`}>
                          {m === "MAPE" ? pct(f[mod][m]) : entero(f[mod][m])}
                        </td>
                      )),
                    )}
                    <td className="px-2 py-2.5 text-right">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: f.mejor_global === "ARIMA" ? COLOR.arima : COLOR.gru }}>
                        {f.mejor_global}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-3 border-t border-borde pt-4 text-xs text-tenue sm:grid-cols-3">
            {METRICAS.map((m) => (
              <div key={m}>
                <dt className="font-semibold text-foreground">{m}</dt>
                <dd>{desc[m]}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          titulo="Verificación de la ejecución en el navegador"
          descripcion="Los dos modelos se ejecutan aquí, sin servidor. Al cargarlos se comparan con las predicciones que dio Python."
        >
          <VerificacionModelos serie={serie} />
        </Panel>
      </div>
    </>
  );
}
