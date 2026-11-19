"use client";

// Gráficas reutilizables construidas con Recharts.
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { COLOR } from "@/lib/colores";
import { corto, euros, fechaCorta, fechaLarga } from "@/lib/formato";

export const ejeX = {
  tick: { fontSize: 11, fill: COLOR.eje },
  tickLine: false,
  axisLine: { stroke: COLOR.rejilla },
  minTickGap: 24,
} as const;
export const ejeY = {
  tick: { fontSize: 11, fill: COLOR.eje },
  tickLine: false,
  axisLine: false,
  width: 52,
  tickFormatter: (v: number) => corto(v),
} as const;
export const rejilla = <CartesianGrid stroke={COLOR.rejilla} strokeDasharray="3 3" vertical={false} />;

type Fila = Record<string, unknown> & { fecha?: string };

/** Tooltip común: muestra la fecha y cada serie con su color y su valor en euros. */
export function TooltipVentas({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-borde bg-superficie px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{typeof label === "string" && /^\d{4}-/.test(label) ? fechaLarga(label) : String(label)}</p>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined && !Array.isArray(p.value))
        .map((p) => (
          <p key={String(p.dataKey)} className="tabular flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-medium">{euros(Number(p.value))}</span>
          </p>
        ))}
      {payload
        .filter((p) => Array.isArray(p.value))
        .map((p) => {
          const [li, ls] = p.value as unknown as [number, number];
          return (
            <p key={String(p.dataKey)} className="tabular mt-0.5 text-tenue">
              IC 95 %: {euros(li)} – {euros(ls)}
            </p>
          );
        })}
    </div>
  );
}

/** Real vs ARIMA vs GRU en el periodo de test. */
export function GraficoTest({ datos, alto = 320 }: { datos: Fila[]; alto?: number }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {rejilla}
        <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
        <YAxis {...ejeY} />
        <Tooltip content={<TooltipVentas />} />
        <Line dataKey="real" name="Real" stroke={COLOR.real} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="arima" name="ARIMA" stroke={COLOR.arima} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="gru" name="GRU" stroke={COLOR.gru} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Histórico reciente + pronóstico ARIMA (con banda IC 95 %) + pronóstico GRU. */
export function GraficoPronostico({ datos, inicioFuturo, alto = 320 }: { datos: Fila[]; inicioFuturo?: string; alto?: number }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {rejilla}
        <XAxis dataKey="fecha" tickFormatter={fechaCorta} {...ejeX} />
        <YAxis {...ejeY} />
        <Tooltip content={<TooltipVentas />} />
        <Area dataKey="banda" name="IC 95 % ARIMA" stroke="none" fill={COLOR.arima} fillOpacity={0.14} isAnimationActive={false} />
        {inicioFuturo && (
          <ReferenceLine x={inicioFuturo} stroke={COLOR.eje} strokeDasharray="4 4" label={{ value: "Pronóstico →", position: "insideTopLeft", fontSize: 11, fill: COLOR.eje }} />
        )}
        <Line dataKey="real" name="Real" stroke={COLOR.real} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="arima" name="ARIMA" stroke={COLOR.arima} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="gru" name="GRU" stroke={COLOR.gru} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Barras simples con un valor por categoría. */
export function GraficoBarras({
  datos,
  x,
  y,
  nombre,
  color = COLOR.arima,
  resaltarMax = false,
  alto = 240,
}: {
  datos: Record<string, unknown>[];
  x: string;
  y: string;
  nombre: string;
  color?: string;
  resaltarMax?: boolean;
  alto?: number;
}) {
  const max = Math.max(...datos.map((d) => Number(d[y]) || 0));
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {rejilla}
        <XAxis dataKey={x} {...ejeX} minTickGap={0} interval={0} />
        <YAxis {...ejeY} />
        <Tooltip content={<TooltipVentas />} cursor={{ fill: COLOR.rejilla, opacity: 0.5 }} />
        <Bar dataKey={y} name={nombre} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {datos.map((d, i) => (
            <Cell key={i} fill={color} fillOpacity={resaltarMax && Number(d[y]) !== max ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
