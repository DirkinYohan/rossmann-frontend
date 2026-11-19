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

/** Pronóstico del periodo de test (desde el final de train) con las exógenas reales. */
export function pronosticarTestArima(meta: ArimaMeta): Promise<Resultado> {
  return enviar<Resultado>({ tipo: "pronosticar", serie: meta.serie, urlModelo: urlModelo(meta), pasos: meta.test.exog.length, exog: meta.test.exog });
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

/**
 * Pronóstico futuro de un escenario: el modelo se extiende con los 42 días de test
 * (último dato real) y luego pronostica `horizonte` días con las exógenas del escenario.
 */
export async function pronosticarArima(meta: ArimaMeta, esc: Escenario): Promise<PuntoPronostico[]> {
  const ultima = meta.test.fechas[meta.test.fechas.length - 1];
  const fechas = Array.from({ length: esc.horizonte }, (_, i) => sumarDias(ultima, i + 1));
  const r = await enviar<Resultado>({
    tipo: "pronosticar",
    serie: meta.serie,
    urlModelo: urlModelo(meta),
    pasos: esc.horizonte,
    exog: exogArima(meta, fechas, esc),
    extension: { y: meta.test.ventas, exog: meta.test.exog },
  });
  // Las ventas no pueden ser negativas (mismo recorte que en el backend).
  return fechas.map((fecha, i) => ({
    fecha,
    pred: Math.max(0, r.media[i]),
    li: Math.max(0, r.li[i]),
    ls: r.ls[i],
  }));
}
