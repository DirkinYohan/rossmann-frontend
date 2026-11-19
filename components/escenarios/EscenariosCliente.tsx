"use client";

import { useMemo, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorValidacionGru, IndicadorPyodide } from "@/components/EstadoModelos";
import { ejeX, ejeY, rejilla, TooltipVentas } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Leyenda, Panel, Segmentado } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { diaFestivo, ESCENARIO_BASE, HORIZONTES, OPCIONES_PROMO, type Escenario, type OpcionPromo } from "@/lib/escenarios";
import { euros, fechaCorta, fechaLarga, pctSigno } from "@/lib/formato";
import { usePronostico } from "@/lib/usarModelos";
import type { Historicos, InfoSerie, Modelo, PuntoPronostico } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; historicos: Historicos };
type Vista = Modelo | "AMBOS";
type Resultado = { sim: PuntoPronostico[]; base: PuntoPronostico[] };

const suma = (xs: PuntoPronostico[]) => xs.reduce((s, p) => s + p.pred, 0);
const colorDe = (m: Modelo) => (m === "ARIMA" ? COLOR.arima : COLOR.gru);
// Base de cada modelo en un tono más claro, para distinguirla del escenario simulado.
const colorBase = (m: Modelo) => (m === "ARIMA" ? "#8fa7e6" : "#eeae86");

/** Frase de interpretación para el equipo de marketing a partir del resultado de la simulación. */
function interpretar(esc: Escenario, modelo: Modelo, r: Resultado): string {
  const tSim = suma(r.sim);
  const dif = tSim - suma(r.base);
  const difPct = (dif / suma(r.base)) * 100;
  if (esc.promo === "sin" && !esc.school && !esc.festivo) {
    return "Este es el escenario base: sirve como referencia para medir el efecto de cualquier acción de marketing o evento de calendario.";
  }
  const partes: string[] = [];
  const tendencia = Math.abs(difPct) < 1 ? "prácticamente no cambia" : difPct > 0 ? "aumenta" : "disminuye";
  partes.push(
    `Según ${modelo}, la venta proyectada a ${esc.horizonte} días ${tendencia}${Math.abs(difPct) < 1 ? "" : ` ${euros(Math.abs(dif))} (${pctSigno(difPct)})`} frente al escenario base.`,
  );
  if (esc.promo !== "sin") {
    if (difPct > 1) {
      const dias = esc.promo === "lv" ? "de lunes a viernes" : "todos los días";
      partes.push(
        `Una promoción ${dias} es rentable si el coste del descuento y la comunicación es menor que ${euros(dif)}; ` +
          `equivale a que el margen sacrificado no supere el ${pctSigno(difPct).replace("+", "")} de la venta base.`,
      );
    } else {
      partes.push("La promoción no genera un incremento claro en este horizonte: conviene reservar el presupuesto para otras fechas o tiendas.");
    }
  }
  if (esc.festivo) {
    const i = diaFestivo(esc.horizonte);
    const cambio = r.base[i] && r.sim[i] ? ((r.sim[i].pred - r.base[i].pred) / r.base[i].pred) * 100 : 0;
    partes.push(`El festivo del ${fechaLarga(r.sim[i]?.fecha ?? "")} cambia la venta de ese día un ${pctSigno(cambio)}; planifica reposición y campañas en los días previos.`);
  }
  if (esc.school) partes.push("Las vacaciones escolares modifican el flujo de clientes: ajusta horarios y surtido de temporada en consecuencia.");
  return partes.join(" ");
}

function ResumenModelo({ modelo, r, esc }: { modelo: Modelo; r: Resultado; esc: Escenario }) {
  const tSim = suma(r.sim);
  const tBase = suma(r.base);
  const dif = tSim - tBase;
  const difPct = (dif / tBase) * 100;
  const color = colorDe(modelo);
  const signo = dif >= 0 ? COLOR.positivo : COLOR.negativo;
  return (
    <dl className="tabular space-y-3">
      <div>
        <dt className="text-xs uppercase tracking-wide text-tenue">Venta total proyectada · {modelo}</dt>
        <dd className="text-2xl font-semibold tracking-tight" style={{ color }}>{euros(tSim)}</dd>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-tenue">Base</dt>
          <dd className="font-medium">{euros(tBase)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-tenue">Diferencia</dt>
          <dd className="font-medium" style={{ color: signo }}>
            {dif >= 0 ? "+" : "−"}
            {euros(Math.abs(dif))} <span className="text-sm font-semibold">({pctSigno(difPct)})</span>
          </dd>
        </div>
      </div>
      <div>
        <dt className="mb-1 text-xs uppercase tracking-wide text-tenue">Interpretación para marketing</dt>
        <dd className="text-sm leading-relaxed">{interpretar(esc, modelo, r)}</dd>
      </div>
    </dl>
  );
}

export function EscenariosCliente() {
  const { datos, error, cargando } = useDatos<Datos>({ series: RUTAS.series, historicos: RUTAS.historicos });
  const [vista, setVista] = useState<Vista>("AMBOS");
  const [serie, setSerie] = useState("total_cadena");
  const [promo, setPromo] = useState<OpcionPromo>("lv");
  const [school, setSchool] = useState(false);
  const [festivo, setFestivo] = useState(false);
  const [horizonte, setHorizonte] = useState<number>(28);
  const esc = useMemo<Escenario>(() => ({ promo, school, festivo, horizonte }), [promo, school, festivo, horizonte]);
  const base = useMemo(() => ESCENARIO_BASE(horizonte), [horizonte]);

  const usarArima = vista !== "GRU" && datos ? esc : null;
  const usarGru = vista !== "ARIMA" && datos ? esc : null;
  // Los dos modelos predicen EN VIVO en el navegador (ARIMA con Pyodide, GRU en TypeScript).
  const aSim = usePronostico("ARIMA", serie, usarArima);
  const aBase = usePronostico("ARIMA", serie, usarArima ? base : null);
  const gSim = usePronostico("GRU", serie, usarGru);
  const gBase = usePronostico("GRU", serie, usarGru ? base : null);

  const modelos: Modelo[] = vista === "AMBOS" ? ["ARIMA", "GRU"] : [vista];
  const resultados: Partial<Record<Modelo, Resultado>> = {};
  if (aSim.datos && aBase.datos) resultados.ARIMA = { sim: aSim.datos, base: aBase.datos };
  if (gSim.datos && gBase.datos) resultados.GRU = { sim: gSim.datos, base: gBase.datos };
  const calculandoArima = modelos.includes("ARIMA") && (aSim.cargando || aBase.cargando);
  const calculandoGru = modelos.includes("GRU") && (gSim.cargando || gBase.cargando);
  const errorModelo = (modelos.includes("ARIMA") && (aSim.error || aBase.error)) || (modelos.includes("GRU") && (gSim.error || gBase.error)) || null;

  const filas = useMemo(() => {
    if (!datos) return [];
    const h = datos.historicos.series[serie];
    const n = h.fechas.length;
    const historia = h.fechas.slice(n - 14).map((fecha, i) => ({ fecha, real: h.abierto[n - 14 + i] ? h.ventas[n - 14 + i] : null }));
    const ref = resultados.ARIMA?.sim ?? resultados.GRU?.sim ?? [];
    return [
      ...historia,
      ...ref.map((p, i) => {
        const a = resultados.ARIMA;
        const g = resultados.GRU;
        return {
          fecha: p.fecha,
          arimaSim: a?.sim[i]?.pred,
          arimaBase: a?.base[i]?.pred,
          banda: a?.sim[i]?.li !== undefined ? ([a.sim[i].li, a.sim[i].ls] as [number, number]) : undefined,
          gruSim: g?.sim[i]?.pred,
          gruBase: g?.base[i]?.pred,
        };
      }),
    ];
    // resultados se deriva de los datos de los hooks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, serie, aSim.datos, aBase.datos, gSim.datos, gBase.datos]);

  if (cargando) return <Cargando />;
  if (error || !datos) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;

  const listos = modelos.filter((m) => resultados[m]);
  const ref = resultados[listos[0]];
  const fechaFestivo = festivo && ref ? ref.sim[diaFestivo(horizonte)]?.fecha : undefined;
  const mostrarArima = modelos.includes("ARIMA") && resultados.ARIMA;
  const mostrarGru = modelos.includes("GRU") && resultados.GRU;

  return (
    <>
      <Encabezado titulo="Simulación de escenarios">
        Define una acción de marketing o un evento de calendario y compara la venta proyectada con el escenario base (sin promo, sin vacaciones y sin festivos).
        Los dos modelos predicen en vivo en tu navegador: ARIMA ejecuta el .joblib con Pyodide y GRU hace el forward pass del .keras en TypeScript.
      </Encabezado>

      <Panel className="mb-6">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Segmentado<Vista>
            etiqueta="Modelo"
            valor={vista}
            onChange={setVista}
            opciones={[{ valor: "ARIMA", etiqueta: "ARIMA" }, { valor: "GRU", etiqueta: "GRU" }, { valor: "AMBOS", etiqueta: "Ambos superpuestos" }]}
          />
          <SelectorSerie series={datos.series} valor={serie} onChange={setSerie} />
          <Segmentado<OpcionPromo> etiqueta="Promo" valor={promo} onChange={setPromo} opciones={OPCIONES_PROMO} />
          <Segmentado<boolean> etiqueta="Vacaciones escolares" valor={school} onChange={setSchool} opciones={[{ valor: false, etiqueta: "No" }, { valor: true, etiqueta: "Sí" }]} />
          <Segmentado<boolean>
            etiqueta="Festivo estatal (a mitad del horizonte)"
            valor={festivo}
            onChange={setFestivo}
            opciones={[{ valor: false, etiqueta: "No" }, { valor: true, etiqueta: "Sí" }]}
          />
          <Segmentado<number> etiqueta="Horizonte" valor={horizonte} onChange={setHorizonte} opciones={HORIZONTES.map((h) => ({ valor: h, etiqueta: `${h} d` }))} />
        </div>
      </Panel>

      <div className="mb-4 space-y-2">
        <IndicadorPyodide visible={calculandoArima} />
        {modelos.includes("GRU") && <ErrorValidacionGru serie={serie} />}
        {errorModelo && <ErrorDatos mensaje={errorModelo} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel
          titulo={`Escenario simulado vs. base · ${vista === "AMBOS" ? "ARIMA y GRU" : vista}`}
          descripcion={ref ? `Del ${fechaLarga(ref.sim[0].fecha)} al ${fechaLarga(ref.sim[ref.sim.length - 1].fecha)}. Se muestran además los últimos 14 días reales.` : undefined}
          accion={
            <Leyenda
              items={[
                { color: COLOR.real, texto: "Real" },
                ...modelos.flatMap((m) => [
                  { color: colorDe(m), texto: `${m} simulado` },
                  { color: colorBase(m), texto: `${m} base`, tipo: "punteada" as const },
                ]),
                ...(modelos.includes("ARIMA") ? [{ color: COLOR.arima, texto: "IC 95 % ARIMA", tipo: "banda" as const }] : []),
              ]}
            />
          }
        >
          <div className="relative">
            {(calculandoArima || calculandoGru) && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-superficie/70 text-sm text-tenue">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-borde border-t-arima" />
                  {calculandoArima ? "Ejecutando ARIMA con Pyodide…" : "Ejecutando GRU…"}
                </span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                {rejilla}
                <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
                <YAxis {...ejeY} />
                <Tooltip content={<TooltipVentas />} />
                {mostrarArima && <Area dataKey="banda" name="IC 95 % ARIMA" stroke="none" fill={COLOR.arima} fillOpacity={0.1} isAnimationActive={false} />}
                {fechaFestivo && (
                  <ReferenceLine x={fechaFestivo} stroke={COLOR.negativo} strokeDasharray="3 3" label={{ value: "Festivo", position: "insideTopRight", fontSize: 11, fill: COLOR.negativo }} />
                )}
                <Line dataKey="real" name="Real" stroke={COLOR.real} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                {mostrarArima && <Line dataKey="arimaBase" name="ARIMA base" stroke={colorBase("ARIMA")} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                {mostrarGru && <Line dataKey="gruBase" name="GRU base" stroke={colorBase("GRU")} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                {mostrarArima && <Line dataKey="arimaSim" name="ARIMA simulado" stroke={COLOR.arima} strokeWidth={2.25} dot={false} isAnimationActive={false} />}
                {mostrarGru && <Line dataKey="gruSim" name="GRU simulado" stroke={COLOR.gru} strokeWidth={2.25} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel titulo="Resumen">
          <div className="divide-y divide-borde [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
            {modelos.map((m) =>
              resultados[m] ? (
                <ResumenModelo key={m} modelo={m} r={resultados[m]!} esc={esc} />
              ) : (
                <p key={m} className="text-sm text-tenue">Calculando {m}…</p>
              ),
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
