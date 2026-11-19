"use client";

// Orquesta la predicción personalizada de /prediccion con los módulos de inferencia que ya
// existen (no duplica nada): ARIMA → lib/arima.ts (Pyodide), GRU → lib/gru.ts (TypeScript).
// Calcula a la vez el escenario del usuario y el escenario base (mismos días y cierres, sin
// promoción, sin vacaciones y sin festivos).

import { pronosticarArimaExog } from "../arima";
import { pronosticarGruDesde } from "../gru";
import type { ArimaMeta, GruMeta, PuntoPronostico } from "../tipos";
import {
  escenarioBase,
  exogArimaDesde,
  exogGruDesde,
  historialArima,
  historialGru,
  type DiaCalendario,
  type DiaHistorial,
} from "./construirExogenas";

export type FilaResultado = {
  fecha: string;
  dia: DiaCalendario;
  arima?: number;
  li?: number;
  ls?: number;
  gru?: number;
  arimaBase?: number;
  gruBase?: number;
};

export type EntradaPrediccion = {
  metaArima: ArimaMeta;
  metaGru: GruMeta;
  calendario: DiaCalendario[];
  /** null = usar el historial del dataset (ventana_gru / estado final del modelo). */
  historial: DiaHistorial[] | null;
  modelos: { ARIMA: boolean; GRU: boolean };
};

/** Días cerrados: la predicción es 0 (no hay ventas), igual que en la limpieza de datos. */
const anularCerrados = (puntos: PuntoPronostico[], dias: DiaCalendario[]) =>
  puntos.map((p, i) => (dias[i].abierto ? p : { ...p, pred: 0, li: 0, ls: 0 }));

async function ejecutarArima(e: EntradaPrediccion, dias: DiaCalendario[]) {
  const hist = e.historial ? historialArima(e.metaArima, e.historial) : undefined;
  return anularCerrados(await pronosticarArimaExog(e.metaArima, exogArimaDesde(e.metaArima, dias), hist), dias);
}

async function ejecutarGru(e: EntradaPrediccion, dias: DiaCalendario[]) {
  // Ventana inicial: los 30 días del dataset o el historial del usuario (cerrados interpolados).
  // Un día futuro cerrado se sigue pasando por la red para no romper la secuencia diaria con
  // la que se entrenó, pero en la ventana entra la estimación del modelo (equivalente a la
  // interpolación del entrenamiento), nunca un 0; en el resultado se muestra 0.
  const ventana = e.historial ? historialGru(e.metaGru, e.historial) : e.metaGru.ventana_gru;
  return anularCerrados(await pronosticarGruDesde(e.metaGru, ventana, exogGruDesde(dias)), dias);
}

export async function predecir(e: EntradaPrediccion): Promise<FilaResultado[]> {
  const base = escenarioBase(e.calendario);
  // ARIMA (worker de Pyodide) y GRU (hilo principal) en paralelo.
  const [aSim, aBase, gSim, gBase] = await Promise.all([
    e.modelos.ARIMA ? ejecutarArima(e, e.calendario) : null,
    e.modelos.ARIMA ? ejecutarArima(e, base) : null,
    e.modelos.GRU ? ejecutarGru(e, e.calendario) : null,
    e.modelos.GRU ? ejecutarGru(e, base) : null,
  ]);
  return e.calendario.map((dia, i) => ({
    fecha: dia.fecha,
    dia,
    arima: aSim?.[i].pred,
    li: aSim?.[i].li,
    ls: aSim?.[i].ls,
    gru: gSim?.[i].pred,
    arimaBase: aBase?.[i].pred,
    gruBase: gBase?.[i].pred,
  }));
}
