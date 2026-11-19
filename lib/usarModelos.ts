"use client";

// Hooks de React que ejecutan los modelos EN EL NAVEGADOR:
//   ARIMA → Pyodide + .joblib (lib/arima.ts)       GRU → forward pass TypeScript + .keras (lib/gru.ts)

import { useEffect, useState } from "react";
import { pronosticarArima, pronosticarReferenciaArima } from "./arima";
import { cargarJson, RUTAS } from "./datos";
import type { Escenario } from "./escenarios";
import { cargarGru, pronosticarGru, type Validacion } from "./gru";
import type { ArimaMeta, GruMeta, Modelo, PuntoPronostico } from "./tipos";

type Estado<T> = { clave: string; datos: T | null; error: string | null };

/** Ejecuta una tarea asíncrona cada vez que cambia `clave` y descarta resultados obsoletos. */
function useTarea<T>(clave: string | null, tarea: () => Promise<T>) {
  const [estado, setEstado] = useState<Estado<T>>({ clave: "", datos: null, error: null });
  useEffect(() => {
    if (!clave) return;
    let activo = true;
    tarea()
      .then((datos) => activo && setEstado({ clave, datos, error: null }))
      .catch((e: Error) => activo && setEstado({ clave, datos: null, error: e.message }));
    return () => {
      activo = false;
    };
    // `tarea` depende solo de lo que codifica `clave`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const vigente = estado.clave === clave;
  return {
    datos: vigente ? estado.datos : null,
    error: vigente ? estado.error : null,
    cargando: Boolean(clave) && !vigente,
  };
}

const metaArima = (serie: string) => cargarJson<ArimaMeta>(RUTAS.arimaMeta(serie));
const metaGru = (serie: string) => cargarJson<GruMeta>(RUTAS.gruMeta(serie));

/** Pronóstico futuro de un escenario con el modelo indicado (null = no ejecutar). */
export function usePronostico(modelo: Modelo, serie: string, esc: Escenario | null) {
  const clave = esc ? `${modelo}|${serie}|${JSON.stringify(esc)}` : null;
  return useTarea<PuntoPronostico[]>(clave, async () =>
    modelo === "ARIMA" ? pronosticarArima(await metaArima(serie), esc!) : pronosticarGru(await metaGru(serie), esc!),
  );
}

export type VerificacionArima = { maxDifRelativa: number; maxDifAbsoluta: number; pasos: number; ok: boolean };

/**
 * Comprueba que ARIMA ejecutado en Pyodide reproduce el pronóstico de referencia calculado
 * en Python con el mismo .joblib (arima_meta_<serie>.json → referencia).
 */
export function useVerificacionArima(serie: string, activo: boolean) {
  return useTarea<VerificacionArima>(activo ? `verif-arima|${serie}` : null, async () => {
    const meta = await metaArima(serie);
    const r = await pronosticarReferenciaArima(meta);
    const ref = meta.referencia;
    let maxAbs = 0;
    let maxRel = 0;
    for (const [i, v] of ref.media.entries()) {
      for (const [a, b] of [[r.media[i], v], [r.li[i], ref.li[i]], [r.ls[i], ref.ls[i]]]) {
        const d = Math.abs(a - b);
        maxAbs = Math.max(maxAbs, d);
        maxRel = Math.max(maxRel, d / Math.max(1, Math.abs(b)));
      }
    }
    return { maxDifRelativa: maxRel, maxDifAbsoluta: maxAbs, pasos: ref.media.length, ok: maxRel < 1e-6 };
  });
}

/** Carga el GRU de la serie y devuelve el resultado de la validación contra Python. */
export function useValidacionGru(serie: string) {
  return useTarea<Validacion>(`valid-gru|${serie}`, async () => (await cargarGru(await metaGru(serie))).validacion);
}
