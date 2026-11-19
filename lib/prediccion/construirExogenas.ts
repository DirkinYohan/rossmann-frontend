// Traduce lo que el usuario rellena en /prediccion (calendario e historial) a las entradas
// exactas de cada modelo, en el MISMO orden de columnas guardado en sus metadatos:
//   ARIMA → meta.exogenas (promo, school_holiday, festivo 0/1)
//   GRU   → promo, school_holiday, festivo_a/b/c (one-hot) + calendario (lo añade lib/gru.ts)

import type { HistorialArima } from "../arima";
import { partesFecha, sumarDias } from "../formato";
import type { ArimaMeta, DiaVentana, ExogDia, GruMeta } from "../tipos";

/** Código interno de StateHoliday: 0 = ninguno, a = festivo público, b = Pascua, c = Navidad. */
export type CodigoFestivo = "0" | "a" | "b" | "c";

export const OPCIONES_FESTIVO: { valor: CodigoFestivo; etiqueta: string }[] = [
  { valor: "0", etiqueta: "Ninguno" },
  { valor: "a", etiqueta: "Festivo público" },
  { valor: "b", etiqueta: "Pascua" },
  { valor: "c", etiqueta: "Navidad" },
];

export const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const diaSemana = (iso: string) => NOMBRES_DIA[partesFecha(iso).dow];

/** Una fila del calendario futuro (Paso 2). */
export type DiaCalendario = { fecha: string; abierto: boolean; promo: boolean; school: boolean; festivo: CodigoFestivo };

/** Una fila del historial propio (Paso 3). `ventas` es texto para poder detectar celdas vacías. */
export type DiaHistorial = DiaCalendario & { ventas: string };

/** Fila por defecto: abierta de lunes a sábado, cerrada el domingo, sin promo/vacaciones/festivo. */
export function diaPorDefecto(fecha: string): DiaCalendario {
  return { fecha, abierto: partesFecha(fecha).dow !== 6, promo: false, school: false, festivo: "0" };
}

/**
 * Calendario de `dias` filas desde ultimaFecha + 1. Si se pasa el calendario anterior, se
 * conservan las filas de las fechas que siguen existiendo (al cambiar el número de días no
 * se pierde lo que el usuario ya marcó).
 */
export function generarCalendario(ultimaFecha: string, dias: number, anterior: DiaCalendario[] = []): DiaCalendario[] {
  const previas = new Map(anterior.map((d) => [d.fecha, d]));
  return Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(ultimaFecha, i + 1);
    return previas.get(fecha) ?? diaPorDefecto(fecha);
  });
}

/** Un día cerrado no puede tener promoción (la tienda no vende). */
export const normalizarDia = <T extends DiaCalendario>(d: T): T => (d.abierto ? d : { ...d, promo: false });

/** Escenario base: los mismos días (y cierres) sin promoción, sin vacaciones y sin festivos. */
export const escenarioBase = (dias: DiaCalendario[]): DiaCalendario[] =>
  dias.map((d) => ({ ...d, promo: false, school: false, festivo: "0" }));

/** Valores numéricos de un día para cualquier modelo. */
function valores(d: DiaCalendario): Record<string, number> {
  const n = normalizarDia(d);
  return {
    promo: n.promo ? 1 : 0,
    school_holiday: n.school ? 1 : 0,
    festivo: n.festivo !== "0" ? 1 : 0,
    festivo_a: n.festivo === "a" ? 1 : 0,
    festivo_b: n.festivo === "b" ? 1 : 0,
    festivo_c: n.festivo === "c" ? 1 : 0,
  };
}

/** Matriz exógena de ARIMA en el orden de meta.exogenas. */
export function exogArimaDesde(meta: Pick<ArimaMeta, "exogenas">, dias: DiaCalendario[]): number[][] {
  return dias.map((d) => {
    const v = valores(d);
    return meta.exogenas.map((nombre) => {
      if (!(nombre in v)) throw new Error(`Variable exógena desconocida en los metadatos de ARIMA: ${nombre}`);
      return v[nombre];
    });
  });
}

/** Exógenas del GRU (StateHoliday en one-hot). El seno/coseno de día y mes lo añade lib/gru.ts. */
export function exogGruDesde(dias: DiaCalendario[]): ExogDia[] {
  return dias.map((d) => {
    const v = valores(d);
    return { fecha: d.fecha, promo: v.promo, school_holiday: v.school_holiday, festivo_a: v.festivo_a, festivo_b: v.festivo_b, festivo_c: v.festivo_c };
  });
}

/** Venta numérica de una fila del historial (los días cerrados valen 0). */
export const ventaHistorial = (d: DiaHistorial) => (d.abierto ? Number(d.ventas) : 0);

/** Historial "del dataset" para el Paso 3: ventana_gru con venta 0 en los días cerrados. */
export function historialDesdeDataset(meta: GruMeta): DiaHistorial[] {
  return meta.ventana_gru.map((d) => ({
    fecha: d.fecha,
    abierto: d.abierto === 1,
    ventas: d.abierto === 1 ? String(Math.round(d.ventas)) : "0",
    // En "Total cadena" promo y vacaciones son proporciones de tiendas: se redondean a Sí/No.
    promo: d.promo >= 0.5,
    school: d.school_holiday >= 0.5,
    festivo: (["0", "a", "b", "c"].includes(d.state_holiday) ? d.state_holiday : "0") as CodigoFestivo,
  }));
}

/** Historial vacío (30 filas) de ultima_fecha − 29 a ultima_fecha. */
export function historialVacio(ultimaFecha: string, dias: number): DiaHistorial[] {
  return Array.from({ length: dias }, (_, i) => ({ ...diaPorDefecto(sumarDias(ultimaFecha, i - dias + 1)), ventas: "" }));
}

/**
 * Ventana inicial del GRU con el historial del usuario. Los días cerrados NO entran como
 * venta 0: igual que en el entrenamiento (limpiar_datos.py), su venta se interpola
 * linealmente entre los días abiertos vecinos. Las ventas se escalan con el MinMax de los
 * metadatos.
 */
export function historialGru(meta: GruMeta, hist: DiaHistorial[]): DiaVentana[] {
  const ventas: (number | null)[] = hist.map((d) => (d.abierto ? Number(d.ventas) : null));
  const abiertos = ventas.flatMap((v, i) => (v === null ? [] : [i]));
  if (abiertos.length === 0) throw new Error("El historial necesita al menos un día abierto con ventas.");
  const interpoladas = ventas.map((v, i) => {
    if (v !== null) return v;
    const ant = [...abiertos].reverse().find((j) => j < i);
    const sig = abiertos.find((j) => j > i);
    if (ant === undefined) return ventas[sig!]!; // extremos: se repite el valor más cercano
    if (sig === undefined) return ventas[ant]!;
    const a = ventas[ant]!;
    const b = ventas[sig]!;
    return a + ((b - a) * (i - ant)) / (sig - ant);
  });
  const rango = meta.escalador_max - meta.escalador_min;
  const beta = meta.ajuste_promo_beta ?? 0;
  const exog = exogGruDesde(hist);
  // El GRU recibe la venta neutralizada: venta / (1 + β·promo), como en entrenar_gru.py.
  return exog.map((e, i) => ({ ...e, ventas_esc: (interpoladas[i] / (1 + beta * e.promo) - meta.escalador_min) / rango }));
}

/** Historial del usuario para `results.apply` de ARIMA (días cerrados → observación faltante). */
export function historialArima(meta: Pick<ArimaMeta, "exogenas" | "dias_ancla" | "fecha_ancla">, hist: DiaHistorial[]): HistorialArima {
  // results.apply reemplaza exactamente los días que guarda el .joblib compacto.
  if (hist.length !== meta.dias_ancla || hist[0]?.fecha !== meta.fecha_ancla) {
    throw new Error(`ARIMA necesita el historial de ${meta.dias_ancla} días desde el ${meta.fecha_ancla}.`);
  }
  return {
    fecha_inicio: hist[0].fecha,
    y: hist.map((d) => (d.abierto ? Number(d.ventas) : null)),
    exog: exogArimaDesde(meta, hist),
  };
}
