"use client";

// Carga de los archivos estáticos de /public. El frontend NO habla con ningún backend:
// todo lo que necesita lo dejó el pipeline de Python en public/data y public/models.

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Descarga un JSON una sola vez por sesión (se comparte entre páginas). */
export function cargarJson<T>(ruta: string): Promise<T> {
  if (!cache.has(ruta)) {
    const p = fetch(ruta).then((r) => {
      if (!r.ok) throw new Error(`No se encontró ${ruta} (HTTP ${r.status}). ¿Ejecutaste el pipeline del backend?`);
      return r.json();
    });
    p.catch(() => cache.delete(ruta)); // permite reintentar si falló
    cache.set(ruta, p);
  }
  return cache.get(ruta) as Promise<T>;
}

type Estado<T> = { datos: T | null; error: string | null; cargando: boolean };

/** Hook que carga varios JSON en paralelo. */
export function useDatos<T extends Record<string, unknown>>(rutas: { [K in keyof T]: string }): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, error: null, cargando: true });
  const clave = JSON.stringify(rutas);

  useEffect(() => {
    let activo = true;
    const entradas = Object.entries(JSON.parse(clave) as Record<string, string>);
    Promise.all(entradas.map(([, ruta]) => cargarJson(ruta)))
      .then((valores) => {
        if (!activo) return;
        const datos = Object.fromEntries(entradas.map(([k], i) => [k, valores[i]])) as T;
        setEstado({ datos, error: null, cargando: false });
      })
      .catch((e: Error) => activo && setEstado({ datos: null, error: e.message, cargando: false }));
    return () => {
      activo = false;
    };
  }, [clave]);

  return estado;
}

export const RUTAS = {
  series: "/data/series.json",
  arima: "/data/arima_escenarios.json",
  gru: "/data/gru_resultados.json",
  comparacion: "/data/comparacion_metricas.json",
  estacionalidad: "/data/estacionalidad.json",
  gruConfig: "/models/gru_config.json",
} as const;
