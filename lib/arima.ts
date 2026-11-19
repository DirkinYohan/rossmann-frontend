"use client";

// Cliente del Web Worker de ARIMA (public/workers/arima-worker.mjs).
// El modelo SARIMAX entrenado en Python se ejecuta aquí mismo, en el navegador, con Pyodide.

import { useSyncExternalStore } from "react";
import { diaFestivo, promoEnFecha, type Escenario } from "./escenarios";
import { sumarDias } from "./formato";
import type { ArimaMeta, PuntoPronostico } from "./tipos";

export type EstadoPyodide = { etapa: "inactivo" | "descargando" | "paquetes" | "modelo" | "listo" | "error"; mensaje: string };
type Resultado = { media: number[]; li: number[]; ls: number[] };
type Pendiente = { resolver: (r: unknown) => void; rechazar: (e: Error) => void };

let worker: Worker | null = null;
let siguienteId = 1;
const pendientes = new Map<number, Pendiente>();
let estadoActual: EstadoPyodide = { etapa: "inactivo", mensaje: "" };
const oyentes = new Set<() => void>();

function fijarEstado(e: EstadoPyodide) {
  estadoActual = e;
  oyentes.forEach((f) => f());
}

function obtenerWorker(): Worker {
  if (!worker) {
    // Worker de módulo servido desde public/: no pasa por el bundler.
    worker = new Worker("/workers/arima-worker.mjs", { type: "module" });
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.tipo === "estado") return fijarEstado({ etapa: m.etapa, mensaje: m.mensaje });
      const p = pendientes.get(m.id);
      if (!p) return;
      pendientes.delete(m.id);
      if (m.tipo === "ok") p.resolver(m.resultado);
      else {
        fijarEstado({ etapa: "error", mensaje: m.mensaje });
        p.rechazar(new Error(m.mensaje));
      }
    };
    worker.onerror = (ev) => fijarEstado({ etapa: "error", mensaje: ev.message || "Error en el worker de Pyodide" });
  }
  return worker;
}

function enviar<T>(msg: Record<string, unknown>): Promise<T> {
  const id = siguienteId++;
  return new Promise<T>((resolver, rechazar) => {
    pendientes.set(id, { resolver: resolver as (r: unknown) => void, rechazar });
    obtenerWorker().postMessage({ id, ...msg });
  });
}

/** Estado de carga de Pyodide para mostrar un indicador en la interfaz. */
export function useEstadoPyodide(): EstadoPyodide {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estadoActual,
    () => estadoActual,
  );
}

export const iniciarPyodide = () => enviar<{ versiones: Record<string, string> }>({ tipo: "iniciar" });

const urlModelo = (meta: ArimaMeta) => new URL(`/models/${meta.archivo}`, window.location.origin).href;

/** Descarga y carga el .joblib en Pyodide sin pronosticar (para habilitar la interfaz). */
export const precargarArima = (meta: ArimaMeta) => enviar<{ cargado: boolean }>({ tipo: "precargar", serie: meta.serie, urlModelo: urlModelo(meta) });

/** Pronóstico de referencia (arima_meta → referencia) para comparar Pyodide con Python. */
export function pronosticarReferenciaArima(meta: ArimaMeta): Promise<Resultado> {
  const r = meta.referencia;
  return enviar<Resultado>({ tipo: "pronosticar", serie: meta.serie, urlModelo: urlModelo(meta), pasos: r.exog.length, exog: r.exog });
}

/** Matriz exógena del escenario en el orden que espera el modelo (meta.exogenas). */
export function exogArima(meta: ArimaMeta, fechas: string[], esc: Escenario): number[][] {
  const iFestivo = esc.festivo ? diaFestivo(esc.horizonte) : -1;
  return fechas.map((f, i) => {
    const valores: Record<string, number> = {
      promo: promoEnFecha(esc.promo, f),
      school_holiday: esc.school ? 1 : 0,
      festivo: i === iFestivo ? 1 : 0,
    };
    return meta.exogenas.map((nombre) => valores[nombre] ?? 0);
  });
}

/** Fechas futuras del pronóstico: desde ultima_fecha + 1 (el .joblib es el modelo reentrenado). */
export const fechasFuturas = (meta: { ultima_fecha: string }, pasos: number) =>
  Array.from({ length: pasos }, (_, i) => sumarDias(meta.ultima_fecha, i + 1));

/** Historial propio para `results.apply`: y = null en días cerrados (observación faltante). */
export type HistorialArima = { fecha_inicio: string; y: (number | null)[]; exog: number[][] };

/**
 * Pronóstico ARIMA con una matriz exógena ya construida (en el orden de meta.exogenas).
 * Sin historial: get_forecast desde el último dato del dataset. Con historial: el worker
 * aplica `results.apply(endog, exog)` sobre esos días y luego pronostica.
 */
export async function pronosticarArimaExog(meta: ArimaMeta, exog: number[][], historial?: HistorialArima): Promise<PuntoPronostico[]> {
  const fechas = fechasFuturas(meta, exog.length);
  const base = { serie: meta.serie, urlModelo: urlModelo(meta), pasos: exog.length, exog };
  const r = await enviar<Resultado>(historial ? { ...base, tipo: "aplicar_y_predecir", historial } : { ...base, tipo: "pronosticar" });
  // Las ventas no pueden ser negativas (mismo recorte que en el backend).
  return fechas.map((fecha, i) => ({
    fecha,
    pred: Math.max(0, r.media[i]),
    li: Math.max(0, r.li[i]),
    ls: Math.max(0, r.ls[i]),
  }));
}

/** Pronóstico futuro de un escenario de /escenarios (desde el día siguiente al último dato). */
export function pronosticarArima(meta: ArimaMeta, esc: Escenario): Promise<PuntoPronostico[]> {
  return pronosticarArimaExog(meta, exogArima(meta, fechasFuturas(meta, esc.horizonte), esc));
}
