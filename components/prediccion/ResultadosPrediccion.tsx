"use client";

// Resultados de /prediccion: gráfica, tarjetas de resumen, tabla día a día y CSV.

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ejeX, ejeY, rejilla, TooltipVentas } from "@/components/graficos";
import { Leyenda, Panel } from "@/components/ui";
import { COLOR } from "@/lib/colores";
import { euros, fechaCorta, fechaLarga, pct, pctSigno } from "@/lib/formato";
import { diaSemana, OPCIONES_FESTIVO } from "@/lib/prediccion/construirExogenas";
import { descargarCsv } from "@/lib/prediccion/exportarCsv";
import type { FilaResultado } from "@/lib/prediccion/predecir";
import type { Modelo } from "@/lib/tipos";

export type PuntoHistoria = { fecha: string; real: number | null };

const colorDe = (m: Modelo) => (m === "ARIMA" ? COLOR.arima : COLOR.gru);
const sumar = (filas: FilaResultado[], k: keyof FilaResultado) => filas.reduce((s, f) => s + ((f[k] as number | undefined) ?? 0), 0);
const signo = (v: number) => (v >= 0 ? "+" : "−");

/** Qué condiciones eligió el usuario (para la frase interpretativa). */
function condicionesElegidas(filas: FilaResultado[]): string | null {
  const promo = filas.some((f) => f.dia.promo);
  const school = filas.some((f) => f.dia.school);
  const festivo = filas.some((f) => f.dia.festivo !== "0");
  const partes = [promo && "promociones", school && "vacaciones escolares", festivo && "festivos"].filter(Boolean) as string[];
  if (partes.length === 0) return null;
  if (partes.length === 1) return `Las ${partes[0]} seleccionadas`.replace("Las festivos", "Los festivos");
  return `Las condiciones seleccionadas (${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]})`;
}

function frase(filas: FilaResultado[], modelo: Modelo, dif: number, difPct: number): string {
  const cond = condicionesElegidas(filas);
  if (!cond) return `No elegiste promociones, vacaciones ni festivos: la predicción de ${modelo} es el propio escenario base.`;
  if (Math.abs(difPct) < 0.5) return `${cond} prácticamente no cambiarían las ventas según ${modelo} (${pctSigno(difPct)}).`;
  const verbo = dif > 0 ? "aumentarían" : "reducirían";
  return `${cond} ${verbo} las ventas en ${euros(Math.abs(dif))} (${pctSigno(difPct)}) según ${modelo}.`;
}

function Tarjeta({ titulo, children, color }: { titulo: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-tenue">{titulo}</p>
      <div className="tabular mt-1.5">{children}</div>
    </div>
  );
}

function Condiciones({ f }: { f: FilaResultado }) {
  if (!f.dia.abierto) return <span className="rounded bg-borde px-1.5 py-0.5 text-[11px] font-medium text-tenue">Cerrada</span>;
  const etiquetas = [
    f.dia.promo && "Promo",
    f.dia.school && "Vacaciones",
    f.dia.festivo !== "0" && OPCIONES_FESTIVO.find((o) => o.valor === f.dia.festivo)?.etiqueta,
  ].filter(Boolean) as string[];
  if (etiquetas.length === 0) return <span className="text-xs text-tenue">Normal</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {etiquetas.map((e) => (
        <span key={e} className="rounded bg-arima/10 px-1.5 py-0.5 text-[11px] font-medium text-arima">
          {e}
        </span>
      ))}
    </span>
  );
}

export function ResultadosPrediccion({
  filas,
  historia,
  modelos,
  mape,
  nombreSerie,
  idSerie,
  historialPropio,
  onNueva,
}: {
  filas: FilaResultado[];
  historia: PuntoHistoria[];
  modelos: Modelo[];
  mape: Partial<Record<Modelo, number>>;
  nombreSerie: string;
  idSerie: string;
  historialPropio: boolean;
  onNueva: () => void;
}) {
  const totales: Record<Modelo, { sim: number; base: number }> = {
    ARIMA: { sim: sumar(filas, "arima"), base: sumar(filas, "arimaBase") },
    GRU: { sim: sumar(filas, "gru"), base: sumar(filas, "gruBase") },
  };
  const ambos = modelos.length === 2;
  const difModelos = totales.ARIMA.sim - totales.GRU.sim;
  const inicio = filas[0].fecha;
  const fin = filas[filas.length - 1].fecha;

  const datos = [
    ...historia.map((h) => ({ fecha: h.fecha, real: h.real })),
    ...filas.map((f) => ({
      fecha: f.fecha,
      arima: f.arima,
      banda: f.li !== undefined && f.ls !== undefined ? ([f.li, f.ls] as [number, number]) : undefined,
      gru: f.gru,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Resultados · {nombreSerie}</h2>
          <p className="text-sm text-tenue">
            {filas.length} {filas.length === 1 ? "día" : "días"}, del {fechaLarga(inicio)} al {fechaLarga(fin)} ·{" "}
            {historialPropio ? "partiendo de tu historial de ventas" : "partiendo del historial del dataset"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => descargarCsv(filas, `prediccion_${idSerie}_${inicio}_${filas.length}d.csv`)}
            className="rounded-lg border border-borde bg-superficie px-3 py-2 text-sm font-medium hover:bg-background"
          >
            Descargar CSV
          </button>
          <button type="button" onClick={onNueva} className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            Nueva predicción
          </button>
        </div>
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${ambos ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {modelos.map((m) => (
          <Tarjeta key={m} titulo={`Venta total proyectada · ${m}`} color={colorDe(m)}>
            <p className="text-2xl font-semibold tracking-tight" style={{ color: colorDe(m) }}>
              {euros(totales[m].sim)}
            </p>
            <p className="text-xs text-tenue">Media diaria (días abiertos): {euros(totales[m].sim / Math.max(1, filas.filter((f) => f.dia.abierto).length))}</p>
          </Tarjeta>
        ))}
        {ambos && (
          <Tarjeta titulo="Diferencia ARIMA − GRU">
            <p className="text-2xl font-semibold tracking-tight">
              {signo(difModelos)}
              {euros(Math.abs(difModelos))}
            </p>
            <p className="text-xs text-tenue">
              {pctSigno((difModelos / Math.max(1, totales.GRU.sim)) * 100)} respecto a GRU ·{" "}
              {Math.abs(difModelos / Math.max(1, totales.GRU.sim)) < 0.05 ? "los dos modelos coinciden bastante" : "los modelos discrepan: toma el rango entre ambos"}
            </p>
          </Tarjeta>
        )}
        <Tarjeta titulo="Confiabilidad (periodo de prueba)">
          <ul className="space-y-1 text-sm">
            {modelos.map((m) => (
              <li key={m}>
                <span className="font-medium" style={{ color: colorDe(m) }}>
                  {m}:
                </span>{" "}
                {mape[m] !== undefined ? <>En el periodo de prueba este modelo tuvo un MAPE de {pct(mape[m]!)}.</> : "MAPE no disponible."}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-tenue">MAPE = error porcentual medio en los últimos 42 días del dataset (menor es mejor).</p>
        </Tarjeta>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modelos.map((m) => {
          const { sim, base } = totales[m];
          const dif = sim - base;
          const difPct = base > 0 ? (dif / base) * 100 : 0;
          return (
            <Tarjeta key={m} titulo={`Frente al escenario base · ${m}`} color={colorDe(m)}>
              <p className="text-lg font-semibold" style={{ color: dif >= 0 ? COLOR.positivo : COLOR.negativo }}>
                {signo(dif)}
                {euros(Math.abs(dif))} <span className="text-sm">({pctSigno(difPct)})</span>
              </p>
              <p className="text-xs text-tenue">Base (mismos días, sin promoción, vacaciones ni festivos): {euros(base)}</p>
              <p className="mt-2 text-sm leading-relaxed">{frase(filas, m, dif, difPct)}</p>
            </Tarjeta>
          );
        })}
      </div>

      <Panel
        titulo="Ventas recientes y predicción"
        descripcion={`Últimos ${historia.length} días ${historialPropio ? "que ingresaste" : "reales"} y predicción día a día. Los días cerrados valen 0 €.`}
        accion={
          <Leyenda
            items={[
              { color: COLOR.real, texto: historialPropio ? "Tu historial" : "Real" },
              ...modelos.map((m) => ({ color: colorDe(m), texto: m })),
              ...(modelos.includes("ARIMA") ? [{ color: COLOR.arima, texto: "IC 95 % ARIMA", tipo: "banda" as const }] : []),
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={datos} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            {rejilla}
            <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
            <YAxis {...ejeY} />
            <Tooltip content={<TooltipVentas />} />
            {modelos.includes("ARIMA") && (
              <Area dataKey="banda" name="IC 95 % ARIMA" stroke="none" fill={COLOR.arima} fillOpacity={0.12} isAnimationActive={false} />
            )}
            <ReferenceLine
              x={inicio}
              stroke={COLOR.eje}
              strokeDasharray="4 4"
              label={{ value: "Inicio de la predicción", position: "insideTopLeft", fontSize: 11, fill: COLOR.eje }}
            />
            <Line dataKey="real" name={historialPropio ? "Tu historial" : "Real"} stroke={COLOR.real} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            {modelos.includes("ARIMA") && <Line dataKey="arima" name="ARIMA" stroke={COLOR.arima} strokeWidth={2.25} dot={{ r: 2 }} isAnimationActive={false} />}
            {modelos.includes("GRU") && <Line dataKey="gru" name="GRU" stroke={COLOR.gru} strokeWidth={2.25} dot={{ r: 2 }} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <Panel titulo="Predicción día a día">
        <div className="max-h-[520px] overflow-auto rounded-lg border border-borde">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-tenue">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Día</th>
                <th className="px-3 py-2 text-left font-medium">Condiciones</th>
                {modelos.includes("ARIMA") && (
                  <>
                    <th className="px-3 py-2 text-right font-medium text-arima">Venta ARIMA</th>
                    <th className="px-3 py-2 text-right font-medium">IC 95 % inf.</th>
                    <th className="px-3 py-2 text-right font-medium">IC 95 % sup.</th>
                  </>
                )}
                {modelos.includes("GRU") && <th className="px-3 py-2 text-right font-medium text-gru">Venta GRU</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr key={f.fecha} className={f.dia.abierto ? "" : "text-tenue"}>
                  <td className="whitespace-nowrap px-3 py-1.5">{f.fecha.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-1.5">{diaSemana(f.fecha)}</td>
                  <td className="px-3 py-1.5">
                    <Condiciones f={f} />
                  </td>
                  {modelos.includes("ARIMA") && (
                    <>
                      <td className="px-3 py-1.5 text-right font-medium">{euros(f.arima ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right">{euros(f.li ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right">{euros(f.ls ?? 0)}</td>
                    </>
                  )}
                  {modelos.includes("GRU") && <td className="px-3 py-1.5 text-right font-medium">{euros(f.gru ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-background font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                {modelos.includes("ARIMA") && (
                  <>
                    <td className="px-3 py-2 text-right">{euros(totales.ARIMA.sim)}</td>
                    <td className="px-3 py-2" colSpan={2} />
                  </>
                )}
                {modelos.includes("GRU") && <td className="px-3 py-2 text-right">{euros(totales.GRU.sim)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
