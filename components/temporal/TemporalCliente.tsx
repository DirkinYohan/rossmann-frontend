"use client";

// Presenta el INFORME de estacionariedad (estacionalidad_informe.json) generado por el backend.
// No se recalcula nada aquí: todas las cifras vienen del JSON.

import { useMemo, useState } from "react";
import { Bar, BarChart, Brush, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ejeX, ejeY, GraficoBarras, rejilla, TooltipVentas } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Panel, Segmentado } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { fechaCorta, fechaLarga, mesAnio, pctSigno } from "@/lib/formato";
import type { EfectoVariable, Historicos, InfoSerie, InformeEstacionalidad, InformeSerie, PruebaADF } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; historicos: Historicos; informe: InformeEstacionalidad };
type Rango = 90 | 365 | 0;

const CASOS: Record<InformeSerie["caso"], { titulo: string; clase: string }> = {
  estacionaria: { titulo: "Estacionaria", clase: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  no_estacionaria: { titulo: "No estacionaria", clase: "bg-red-50 text-red-800 ring-red-200" },
  estacionaria_en_tendencia: { titulo: "Estacionaria en tendencia", clase: "bg-amber-50 text-amber-900 ring-amber-200" },
  estacionaria_en_diferencias: { titulo: "Estacionaria en diferencias", clase: "bg-sky-50 text-sky-900 ring-sky-200" },
};

const num = (v: number, d = 4) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

function Veredicto({ ok }: { ok: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {ok ? "Estacionaria" : "No estacionaria"}
    </span>
  );
}

function FilaPrueba({ prueba, hipotesis, p }: { prueba: string; hipotesis: string; p: PruebaADF }) {
  return (
    <tr className="border-b border-borde last:border-0 align-top">
      <td className="py-2.5 pr-3">
        <p className="font-medium">{prueba}</p>
        <p className="text-xs text-tenue">{hipotesis}</p>
      </td>
      <td className="px-2 py-2.5 text-right">{num(p.estadistico, 3)}</td>
      <td className="px-2 py-2.5 text-right">{num(p.p_valor)}</td>
      <td className="px-2 py-2.5 text-right">{p.rezagos}</td>
      {["1%", "5%", "10%"].map((k) => (
        <td key={k} className="px-2 py-2.5 text-right text-tenue">{p.valores_criticos[k] !== undefined ? num(p.valores_criticos[k], 3) : "–"}</td>
      ))}
      <td className="px-2 py-2.5"><Veredicto ok={p.estacionaria} /></td>
    </tr>
  );
}

function GraficoComponente({ datos, clave, nombre, color, cero = false }: { datos: Record<string, unknown>[]; clave: string; nombre: string; color: string; cero?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
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

function GraficoCorrelacion({ rezagos, valores, banda, titulo }: { rezagos: number[]; valores: number[]; banda: number; titulo: string }) {
  const filas = rezagos.map((lag, i) => ({ lag, valor: valores[i] })).filter((d) => d.lag > 0);
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

const aFilas = (obj: Record<string, number>) => Object.entries(obj).map(([nombre, venta_promedio]) => ({ nombre, venta_promedio }));
const gruposAFilas = (e: EfectoVariable) => Object.entries(e.grupos).map(([grupo, g]) => ({ grupo, venta_promedio: g.venta_promedio, dias: g.dias }));

export function TemporalCliente() {
  const { datos, error, cargando } = useDatos<Datos>({ series: RUTAS.series, historicos: RUTAS.historicos, informe: RUTAS.estacionalidad });
  const [serie, setSerie] = useState("total_cadena");
  const [rango, setRango] = useState<Rango>(90);

  const inf = datos?.informe.series[serie];
  const h = datos?.historicos.series[serie];
  const historico = useMemo(() => (h ? h.fechas.map((fecha, i) => ({ fecha, ventas: h.abierto[i] ? h.ventas[i] : null })) : []), [h]);
  const stl = useMemo(() => {
    if (!inf) return [];
    const filas = inf.stl.fechas.map((fecha, i) => ({ fecha, tendencia: inf.stl.tendencia[i], estacional: inf.stl.estacional[i], residuo: inf.stl.residuo[i] }));
    return rango ? filas.slice(-rango) : filas;
  }, [inf, rango]);

  if (cargando) return <Cargando />;
  if (error || !datos || !inf) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;
  const ef = inf.efecto_variables_externas;
  const caso = CASOS[inf.caso];
  const dr = inf.diferenciacion_recomendada;
  const d7 = inf.pruebas_tras_diferencia_estacional;

  return (
    <>
      <Encabezado titulo="Visualización temporal">
        Informe estadístico de estacionariedad y estacionalidad generado por el backend ({fechaLarga(datos.informe.generado.slice(0, 10))}). Justifica los parámetros del SARIMAX; esta página solo lo presenta.
      </Encabezado>
      <div className="mb-6">
        <SelectorSerie series={datos.series} valor={serie} onChange={setSerie} />
      </div>

      <div className="grid gap-6">
        <Panel
          titulo="Informe de estacionariedad: ADF y KPSS"
          descripcion={`Nivel de significancia α = ${String(datos.informe.alfa).replace(".", ",")} · ${inf.n_observaciones} observaciones diarias.`}
          accion={<span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${caso.clase}`}>{caso.titulo}</span>}
        >
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="tabular w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-tenue">
                  <th className="py-2 pr-3 font-medium">Prueba</th>
                  <th className="px-2 py-2 text-right font-medium">Estadístico</th>
                  <th className="px-2 py-2 text-right font-medium">p-valor</th>
                  <th className="px-2 py-2 text-right font-medium">Rezagos</th>
                  <th className="px-2 py-2 text-right font-medium">Crít. 1 %</th>
                  <th className="px-2 py-2 text-right font-medium">Crít. 5 %</th>
                  <th className="px-2 py-2 text-right font-medium">Crít. 10 %</th>
                  <th className="px-2 py-2 font-medium">Veredicto</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4 sm:[&_td:first-child]:pl-0">
                <FilaPrueba prueba="ADF (Dickey-Fuller aumentada)" hipotesis="H₀: raíz unitaria → p < α indica estacionaria" p={inf.adf} />
                <FilaPrueba prueba="KPSS" hipotesis="H₀: estacionaria en nivel → p < α indica no estacionaria" p={inf.kpss} />
              </tbody>
            </table>
          </div>
          {inf.kpss.nota_p_valor && <p className="mt-2 text-xs text-tenue">Nota: {inf.kpss.nota_p_valor}</p>}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="rounded-lg bg-background p-4 text-sm leading-relaxed">
              <p className="mb-1 font-medium">Conclusión</p>
              <p className="text-tenue">{inf.conclusion}</p>
            </div>
            <div className="rounded-lg border border-borde p-4">
              <p className="text-xs uppercase tracking-wide text-tenue">Diferenciación recomendada</p>
              <p className="tabular mt-2 text-2xl font-semibold tracking-tight">
                d = {dr.d} · D = {dr.D} <span className="text-base font-normal text-tenue">(m = {dr.periodo})</span>
              </p>
              <p className="mt-2 text-xs text-tenue">
                Tras diferenciar con lag {dr.periodo}: ADF p = {num(d7.adf.p_valor)} ({d7.adf.estacionaria ? "estac." : "no estac."}) · KPSS p = {num(d7.kpss.p_valor)} (
                {d7.kpss.estacionaria ? "estac." : "no estac."})
              </p>
            </div>
          </div>
        </Panel>

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
          descripcion={`Tendencia + estacionalidad semanal + residuo. Fuerza de la estacionalidad: ${inf.fuerza_estacionalidad.toFixed(2).replace(".", ",")} (0 = nula, 1 = total).`}
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
            <GraficoBarras datos={aFilas(inf.promedio_por_dia_semana)} x="nombre" y="venta_promedio" nombre="Venta promedio" resaltarMax />
          </Panel>
          <Panel titulo="Venta promedio por mes" descripcion="Estacionalidad anual: el pico de diciembre es demanda real (Navidad).">
            <GraficoBarras datos={aFilas(inf.promedio_por_mes)} x="nombre" y="venta_promedio" nombre="Venta promedio" color={COLOR.gru} resaltarMax />
          </Panel>
        </div>

        <Panel
          titulo="Autocorrelación (ACF) y autocorrelación parcial (PACF)"
          descripcion={`Hasta el rezago ${datos.informe.max_rezago}. En naranja los múltiplos de 7; las líneas rojas marcan la banda de confianza del 95 % (±${num(inf.acf.banda_confianza, 3)}). Las barras tenues no son significativas.`}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <GraficoCorrelacion rezagos={inf.acf.rezagos} valores={inf.acf.valores} banda={inf.acf.banda_confianza} titulo="ACF" />
            <GraficoCorrelacion rezagos={inf.pacf.rezagos} valores={inf.pacf.valores} banda={inf.pacf.banda_confianza} titulo="PACF" />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel titulo="Efecto de la promoción" descripcion={ef.promo.efecto_pct !== null ? `Efecto: ${pctSigno(ef.promo.efecto_pct)}` : undefined}>
            <GraficoBarras datos={gruposAFilas(ef.promo)} x="grupo" y="venta_promedio" nombre="Venta promedio" alto={220} />
          </Panel>
          <Panel titulo="Vacaciones escolares" descripcion={ef.school_holiday.efecto_pct !== null ? `Efecto: ${pctSigno(ef.school_holiday.efecto_pct)}` : undefined}>
            <GraficoBarras datos={gruposAFilas(ef.school_holiday)} x="grupo" y="venta_promedio" nombre="Venta promedio" color={COLOR.gru} alto={220} />
          </Panel>
          <Panel titulo="Festivos estatales" descripcion={`Días abiertos por tipo: ${gruposAFilas(ef.state_holiday).map((g) => `${g.grupo} ${g.dias}`).join(" · ")}`}>
            <GraficoBarras datos={gruposAFilas(ef.state_holiday)} x="grupo" y="venta_promedio" nombre="Venta promedio" color={COLOR.eje} alto={220} />
          </Panel>
        </div>
      </div>
    </>
  );
}
