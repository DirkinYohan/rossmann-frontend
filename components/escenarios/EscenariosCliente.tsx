"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ejeX, ejeY, rejilla, TooltipVentas } from "@/components/graficos";
import { SelectorSerie } from "@/components/SelectorSerie";
import { Cargando, Encabezado, ErrorDatos, Leyenda, Panel, Segmentado } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { RUTAS, useDatos } from "@/lib/datos";
import { claveArima, diaFestivo, ESCENARIO_BASE, HORIZONTES, OPCIONES_PROMO, type Escenario, type OpcionPromo } from "@/lib/escenarios";
import { euros, fechaCorta, fechaLarga, pctSigno } from "@/lib/formato";
import { pronosticarGru } from "@/lib/gru";
import type { ArimaEscenarios, GruConfig, InfoSerie, Modelo, PuntoPronostico } from "@/lib/tipos";

type Datos = { series: InfoSerie[]; arima: ArimaEscenarios; gruConfig: GruConfig };
type Resultado = { sim: PuntoPronostico[]; base: PuntoPronostico[] };

const suma = (xs: PuntoPronostico[]) => xs.reduce((s, p) => s + p.pred, 0);

/** Frase de interpretación para el equipo de marketing a partir del resultado de la simulación. */
function interpretar(esc: Escenario, modelo: Modelo, dif: number, difPct: number, sim: PuntoPronostico[], base: PuntoPronostico[]): string {
  if (esc.promo === "sin" && !esc.school && !esc.festivo) {
    return "Este es el escenario base: sirve como referencia para medir el efecto de cualquier acción de marketing o evento de calendario.";
  }
  const partes: string[] = [];
  const tendencia = Math.abs(difPct) < 1 ? "prácticamente no cambia" : difPct > 0 ? "aumenta" : "disminuye";
  partes.push(
    `Según ${modelo}, la venta proyectada a ${esc.horizonte} días ${tendencia} ${Math.abs(difPct) < 1 ? "" : `${euros(Math.abs(dif))} (${pctSigno(difPct)}) `}frente al escenario base.`,
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
    const caida = base[i] && sim[i] ? ((sim[i].pred - base[i].pred) / base[i].pred) * 100 : 0;
    partes.push(
      `El festivo del ${fechaLarga(sim[i]?.fecha ?? "")} cambia la venta de ese día un ${pctSigno(caida)}; ` +
        "planifica la reposición y las campañas en los días previos.",
    );
  }
  if (esc.school) {
    partes.push("Las vacaciones escolares modifican el flujo de clientes: ajusta horarios y surtido de temporada en consecuencia.");
  }
  return partes.join(" ");
}

export function EscenariosCliente() {
  const { datos, error, cargando } = useDatos<Datos>({ series: RUTAS.series, arima: RUTAS.arima, gruConfig: RUTAS.gruConfig });
  const [modelo, setModelo] = useState<Modelo>("ARIMA");
  const [serie, setSerie] = useState("total");
  const [promo, setPromo] = useState<OpcionPromo>("lv");
  const [school, setSchool] = useState(false);
  const [festivo, setFestivo] = useState(false);
  const [horizonte, setHorizonte] = useState<number>(28);
  const esc = useMemo<Escenario>(() => ({ promo, school, festivo, horizonte }), [promo, school, festivo, horizonte]);

  // ---- ARIMA: lectura directa del escenario precalculado ----
  const resArima = useMemo<Resultado | null>(() => {
    if (!datos) return null;
    const e = datos.arima.series[serie].escenarios;
    return { sim: e[claveArima(esc)].slice(0, horizonte), base: e[claveArima(ESCENARIO_BASE(horizonte))].slice(0, horizonte) };
  }, [datos, serie, esc, horizonte]);

  // ---- GRU: inferencia en vivo con onnxruntime-web ----
  const [resGru, setResGru] = useState<{ clave: string; res: Resultado } | null>(null);
  const [errorGru, setErrorGru] = useState<string | null>(null);
  const claveGru = `${serie}|${JSON.stringify(esc)}`;
  useEffect(() => {
    if (!datos || modelo !== "GRU") return;
    let activo = true;
    Promise.all([pronosticarGru(datos.gruConfig, serie, esc), pronosticarGru(datos.gruConfig, serie, ESCENARIO_BASE(esc.horizonte))])
      .then(([sim, base]) => {
        if (!activo) return;
        setResGru({ clave: claveGru, res: { sim, base } });
        setErrorGru(null);
      })
      .catch((e: Error) => activo && setErrorGru(`Error al ejecutar el modelo ONNX: ${e.message}`));
    return () => {
      activo = false;
    };
  }, [datos, modelo, serie, esc, claveGru]);

  const calculandoGru = modelo === "GRU" && resGru?.clave !== claveGru && !errorGru;
  const res = modelo === "ARIMA" ? resArima : resGru?.res ?? null;

  const vista = useMemo(() => {
    if (!datos || !res) return null;
    const historia = datos.gruConfig.series[serie].ultimos_dias.slice(-14);
    const filas = [
      ...historia.map((d) => ({ fecha: d.fecha, real: d.ventas })),
      ...res.sim.map((p, i) => ({
        fecha: p.fecha,
        sim: p.pred,
        base: res.base[i]?.pred,
        banda: p.li !== undefined && p.ls !== undefined ? ([p.li, p.ls] as [number, number]) : undefined,
      })),
    ];
    const tSim = suma(res.sim);
    const tBase = suma(res.base);
    const dif = tSim - tBase;
    const difPct = (dif / tBase) * 100;
    return { filas, tSim, tBase, dif, difPct, texto: interpretar(esc, modelo, dif, difPct, res.sim, res.base) };
  }, [datos, res, serie, esc, modelo]);

  if (cargando) return <Cargando />;
  if (error || !datos) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;

  const color = modelo === "ARIMA" ? COLOR.arima : COLOR.gru;
  const fechaFestivo = festivo && res ? res.sim[diaFestivo(horizonte)]?.fecha : undefined;

  return (
    <>
      <Encabezado titulo="Simulación de escenarios">
        Define una acción de marketing o un evento de calendario y compara la venta proyectada con el escenario base (sin promo, sin vacaciones y sin festivos).
        ARIMA usa escenarios precalculados en Python; GRU se ejecuta en vivo en tu navegador con ONNX Runtime.
      </Encabezado>

      <Panel className="mb-6">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Segmentado<Modelo>
            etiqueta="Modelo"
            valor={modelo}
            onChange={setModelo}
            opciones={[{ valor: "ARIMA", etiqueta: "ARIMA (SARIMAX)" }, { valor: "GRU", etiqueta: "GRU (ONNX en vivo)" }]}
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
          <Segmentado<number> etiqueta="Horizonte" valor={horizonte} onChange={setHorizonte} opciones={HORIZONTES.map((h) => ({ valor: h, etiqueta: `${h} días` }))} />
        </div>
      </Panel>

      {errorGru && modelo === "GRU" && <ErrorDatos mensaje={errorGru} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel
          titulo={`Escenario simulado vs. base · ${modelo}`}
          descripcion={res ? `Del ${fechaLarga(res.sim[0].fecha)} al ${fechaLarga(res.sim[res.sim.length - 1].fecha)}. Se muestran además los últimos 14 días reales.` : undefined}
          accion={
            <Leyenda
              items={[
                { color: COLOR.real, texto: "Real" },
                { color, texto: "Escenario simulado" },
                ...(modelo === "ARIMA" ? [{ color, texto: "IC 95 %", tipo: "banda" as const }] : []),
                { color: COLOR.base, texto: "Escenario base", tipo: "punteada" as const },
              ]}
            />
          }
        >
          <div className="relative">
            {calculandoGru && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-superficie/70 text-sm text-tenue">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-borde border-t-gru" />
                  Ejecutando GRU en el navegador…
                </span>
              </div>
            )}
            {vista ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={vista.filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  {rejilla}
                  <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
                  <YAxis {...ejeY} />
                  <Tooltip content={<TooltipVentas />} />
                  <Area dataKey="banda" name="IC 95 %" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} />
                  {fechaFestivo && (
                    <ReferenceLine x={fechaFestivo} stroke={COLOR.negativo} strokeDasharray="3 3" label={{ value: "Festivo", position: "insideTopRight", fontSize: 11, fill: COLOR.negativo }} />
                  )}
                  <Line dataKey="real" name="Real" stroke={COLOR.real} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="base" name="Base" stroke={COLOR.base} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Line dataKey="sim" name="Simulado" stroke={color} strokeWidth={2.25} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px]" />
            )}
          </div>
        </Panel>

        <Panel titulo="Resumen">
          {vista ? (
            <dl className="tabular space-y-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-tenue">Venta total proyectada</dt>
                <dd className="text-2xl font-semibold tracking-tight" style={{ color }}>{euros(vista.tSim)}</dd>
                <dd className="text-xs text-tenue">{horizonte} días · {modelo}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-tenue">Base</dt>
                  <dd className="font-medium">{euros(vista.tBase)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-tenue">Diferencia</dt>
                  <dd className="font-medium" style={{ color: vista.dif >= 0 ? COLOR.positivo : COLOR.negativo }}>
                    {vista.dif >= 0 ? "+" : "−"}
                    {euros(Math.abs(vista.dif))}
                  </dd>
                  <dd className="text-sm font-semibold" style={{ color: vista.dif >= 0 ? COLOR.positivo : COLOR.negativo }}>
                    {pctSigno(vista.difPct)}
                  </dd>
                </div>
              </div>
              <div className="border-t border-borde pt-4">
                <dt className="mb-1 text-xs uppercase tracking-wide text-tenue">Interpretación para marketing</dt>
                <dd className="text-sm leading-relaxed">{vista.texto}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-tenue">Calculando…</p>
          )}
        </Panel>
      </div>
    </>
  );
}
