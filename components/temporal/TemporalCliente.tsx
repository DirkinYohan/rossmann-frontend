"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Brush, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ejeX, ejeY, GraficoBarras, rejilla, TooltipVentas } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Panel, Segmentado } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { fechaCorta, mesAnio, pctSigno } from "@/lib/formato";
import type { Estacionalidad, InfoSerie, Prueba } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; estacionalidad: Estacionalidad };
type Rango = 90 | 365 | 0;

function GraficoComponente({ datos, clave, nombre, color, alto = 170, cero = false }: {
  datos: Record<string, unknown>[]; clave: string; nombre: string; color: string; alto?: number; cero?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <LineChart data={datos} syncId="stl" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        {rejilla}
        <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
        <YAxis {...ejeY} domain={["auto", "auto"]} />
        <Tooltip content={<TooltipVentas />} />
        {cero && <ReferenceLine y={0} stroke={COLOR.eje} />}
        <Line dataKey={clave} name={nombre} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function GraficoCorrelacion({ datos, banda, titulo }: { datos: { lag: number; valor: number }[]; banda: number; titulo: string }) {
  const filas = datos.filter((d) => d.lag > 0);
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{titulo}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={filas} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {rejilla}
          <XAxis dataKey="lag" {...ejeX} minTickGap={8} />
          <YAxis {...ejeY} tickFormatter={(v: number) => v.toFixed(1)} domain={[-1, 1]} width={36} />
          <Tooltip
            cursor={{ fill: COLOR.rejilla, opacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-borde bg-superficie px-3 py-2 text-xs shadow-md">
                  Rezago {String(payload[0].payload.lag)}: <b>{Number(payload[0].value).toFixed(3)}</b>
                </div>
              ) : null
            }
          />
          <ReferenceLine y={banda} stroke={COLOR.negativo} strokeDasharray="4 3" />
          <ReferenceLine y={-banda} stroke={COLOR.negativo} strokeDasharray="4 3" />
          <ReferenceLine y={0} stroke={COLOR.eje} />
          <Bar dataKey="valor" isAnimationActive={false}>
            {filas.map((d) => (
              <Cell key={d.lag} fill={d.lag % 7 === 0 ? COLOR.gru : COLOR.arima} fillOpacity={Math.abs(d.valor) > banda ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilaPrueba({ nombre, p }: { nombre: string; p: Prueba }) {
  const ok = (v: boolean) => (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${v ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {v ? "Estacionaria" : "No estacionaria"}
    </span>
  );
  return (
    <tr className="border-b border-borde last:border-0">
      <td className="py-2 pr-3 font-medium">{nombre}</td>
      <td className="px-2 py-2 text-right">{p.adf.estadistico.toFixed(3)}</td>
      <td className="px-2 py-2 text-right">{p.adf.p_valor.toFixed(4)}</td>
      <td className="px-2 py-2">{ok(p.adf_estacionaria)}</td>
      <td className="px-2 py-2 text-right">{p.kpss.estadistico.toFixed(3)}</td>
      <td className="px-2 py-2 text-right">{p.kpss.p_valor.toFixed(4)}</td>
      <td className="px-2 py-2">{ok(p.kpss_estacionaria)}</td>
    </tr>
  );
}

export function TemporalCliente() {
  const { datos, error, cargando } = useDatos<Datos>({ series: RUTAS.series, estacionalidad: RUTAS.estacionalidad });
  const [serie, setSerie] = useState("total");
  const [rango, setRango] = useState<Rango>(90);

  const e = datos?.estacionalidad.series[serie];
  const historico = useMemo(() => e?.historico.map((d) => ({ fecha: d.fecha, ventas: d.abierto ? d.ventas : null })) ?? [], [e]);
  const stl = useMemo(() => (e ? (rango ? e.stl.slice(-rango) : e.stl) : []), [e, rango]);

  if (cargando) return <Cargando />;
  if (error || !datos || !e) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;
  const ef = e.efectos;

  return (
    <>
      <Encabezado titulo="Visualización temporal">
        Serie histórica, descomposición STL, patrones semanal y anual, autocorrelaciones y pruebas de estacionariedad que justifican los parámetros del SARIMAX.
      </Encabezado>
      <div className="mb-6">
        <SelectorSerie series={datos.series} valor={serie} onChange={setSerie} />
      </div>

      <div className="grid gap-6">
        <Panel titulo="Serie histórica completa" descripcion="Venta diaria en días abiertos (2013–2015). Arrastra los extremos de la barra inferior para hacer zoom.">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={historico} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {rejilla}
              <XAxis dataKey="fecha" tickFormatter={mesAnio} {...ejeX} minTickGap={40} />
              <YAxis {...ejeY} />
              <Tooltip content={<TooltipVentas />} />
              <Line dataKey="ventas" name="Ventas" stroke={COLOR.real} strokeWidth={1.25} dot={false} isAnimationActive={false} />
              <Brush dataKey="fecha" height={28} stroke={COLOR.arima} tickFormatter={mesAnio} startIndex={Math.max(0, historico.length - 180)} travellerWidth={8} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          titulo="Descomposición STL (periodo 7)"
          descripcion={`Tendencia + estacionalidad semanal + residuo. Fuerza de la estacionalidad semanal: ${e.fuerza_estacional_semanal.toFixed(2).replace(".", ",")} (0 = nula, 1 = total).`}
          accion={
            <Segmentado<Rango>
              etiqueta="Rango"
              valor={rango}
              onChange={setRango}
              opciones={[{ valor: 90, etiqueta: "90 días" }, { valor: 365, etiqueta: "1 año" }, { valor: 0, etiqueta: "Todo" }]}
            />
          }
        >
          <div className="grid gap-4">
            <div>
              <h3 className="mb-1 text-sm font-medium">Tendencia</h3>
              <GraficoComponente datos={stl} clave="tendencia" nombre="Tendencia" color={COLOR.arima} />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">Estacionalidad semanal</h3>
              <GraficoComponente datos={stl} clave="estacional" nombre="Estacional" color={COLOR.gru} cero />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">Residuo</h3>
              <GraficoComponente datos={stl} clave="residuo" nombre="Residuo" color={COLOR.eje} cero />
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel titulo="Venta promedio por día de la semana" descripcion="Solo días abiertos. Resaltado el día de mayor venta.">
            <GraficoBarras datos={e.semanal} x="nombre" y="venta_promedio" nombre="Venta promedio" resaltarMax />
          </Panel>
          <Panel titulo="Venta promedio por mes" descripcion="Estacionalidad anual: el pico de diciembre es demanda real (Navidad).">
            <GraficoBarras datos={e.mensual} x="nombre" y="venta_promedio" nombre="Venta promedio" color={COLOR.gru} resaltarMax />
          </Panel>
        </div>

        <Panel
          titulo="Autocorrelación (ACF) y autocorrelación parcial (PACF)"
          descripcion="Hasta el rezago 60. En naranja los múltiplos de 7; las líneas rojas marcan el intervalo de confianza del 95 %. Las barras tenues no son significativas."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <GraficoCorrelacion datos={e.acf} banda={e.banda_confianza} titulo="ACF" />
            <GraficoCorrelacion datos={e.pacf} banda={e.banda_confianza} titulo="PACF" />
          </div>
        </Panel>

        <Panel titulo="Pruebas de estacionariedad: ADF y KPSS" descripcion="ADF: H₀ = raíz unitaria (p < 0,05 → estacionaria). KPSS: H₀ = estacionaria (p < 0,05 → no estacionaria).">
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-tenue">
                  <th className="py-2 pr-3 font-medium">Serie</th>
                  <th className="px-2 py-2 text-right font-medium">ADF</th>
                  <th className="px-2 py-2 text-right font-medium">p</th>
                  <th className="px-2 py-2 font-medium">Conclusión</th>
                  <th className="px-2 py-2 text-right font-medium">KPSS</th>
                  <th className="px-2 py-2 text-right font-medium">p</th>
                  <th className="px-2 py-2 font-medium">Conclusión</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4 sm:[&_td:first-child]:pl-0">
                <FilaPrueba nombre="Original" p={e.pruebas.original} />
                <FilaPrueba nombre="Diferencia regular (d=1)" p={e.pruebas.diferencia_1} />
                <FilaPrueba nombre="Diferencia estacional (lag 7)" p={e.pruebas.diferencia_estacional_7} />
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-lg bg-background p-4 text-sm leading-relaxed">
            <p className="mb-1 font-medium">
              Interpretación · d sugerido = {e.pruebas.d_sugerido}, D = {e.pruebas.D_sugerido} (m = 7)
            </p>
            <p className="text-tenue">{e.pruebas.interpretacion}</p>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel titulo="Efecto de la promoción" descripcion={ef.uplift_promo_pct !== null ? `Uplift: ${pctSigno(ef.uplift_promo_pct)}` : undefined}>
            <GraficoBarras datos={ef.promo} x="grupo" y="venta_promedio" nombre="Venta promedio" alto={220} />
          </Panel>
          <Panel titulo="Vacaciones escolares" descripcion={ef.uplift_school_pct !== null ? `Diferencia: ${pctSigno(ef.uplift_school_pct)}` : undefined}>
            <GraficoBarras datos={ef.school_holiday} x="grupo" y="venta_promedio" nombre="Venta promedio" color={COLOR.gru} alto={220} />
          </Panel>
          <Panel titulo="Festivos estatales" descripcion={`Días abiertos por tipo: ${ef.state_holiday.map((g) => `${g.grupo} ${g.dias}`).join(" · ")}`}>
            <GraficoBarras datos={ef.state_holiday} x="grupo" y="venta_promedio" nombre="Venta promedio" color={COLOR.eje} alto={220} />
          </Panel>
        </div>
      </div>
    </>
  );
}
