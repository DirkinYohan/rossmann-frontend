"use client";

// Modelo GRU en el navegador: forward pass en TypeScript a partir del .keras (ver lib/keras.ts).
// Replica EXACTAMENTE la construcción de ventanas de rossmann-backend/src/modelo_gru/entrenar_gru.py:
//   paso k (0..29) para predecir el día t = [ventas_esc(t-30+k), exógenas(t-29+k)]
//   exógenas = promo, school_holiday, festivo_a, festivo_b, festivo_c,
//              sin/cos(2π·dow/7) (dow 0 = lunes), sin/cos(2π·(mes-1)/12)

import { cargarJson } from "./datos";
import { diaFestivo, promoEnFecha, type Escenario } from "./escenarios";
import { partesFecha, sumarDias } from "./formato";
import { cargarKeras, type ModeloKeras } from "./keras";
import type { GruMeta, GruReferencia, PuntoPronostico } from "./tipos";

export type Validacion = { casos: number; maxDiferencia: number; tolerancia: number; ok: boolean };
export type GruCargado = { modelo: ModeloKeras; validacion: Validacion };

const cache = new Map<string, Promise<GruCargado>>();

/**
 * Carga el .keras y lo VALIDA contra gru_referencia_<serie>.json: ejecuta las 5 ventanas de
 * referencia y exige una diferencia < 1e-4 con las predicciones de Python. Si falla, lanza
 * un error que la interfaz muestra en pantalla.
 */
export function cargarGru(meta: GruMeta): Promise<GruCargado> {
  if (!cache.has(meta.serie)) {
    const p = (async () => {
      const [modelo, ref] = await Promise.all([
        cargarKeras(`/models/${meta.archivo}`),
        cargarJson<GruReferencia>(`/data/gru_referencia_${meta.serie}.json`),
      ]);
      let maxDiferencia = 0;
      for (const caso of ref.casos) {
        const salida = modelo.predecir(caso.entrada)[0];
        maxDiferencia = Math.max(maxDiferencia, Math.abs(salida - caso.salida));
      }
      const validacion = { casos: ref.casos.length, maxDiferencia, tolerancia: ref.tolerancia, ok: maxDiferencia < ref.tolerancia };
      if (!validacion.ok) {
        throw new Error(
          `Validación del GRU fallida para ${meta.nombre}: la diferencia con Python es ${maxDiferencia.toExponential(2)} ` +
            `(tolerancia ${ref.tolerancia}). El forward pass en TypeScript no reproduce el modelo entrenado.`,
        );
      }
      return { modelo, validacion };
    })();
    p.catch(() => cache.delete(meta.serie));
    cache.set(meta.serie, p);
  }
  return cache.get(meta.serie)!;
}

type Exogenas = number[];

function exogenas(iso: string, promo: number, school: number, fa: number, fb: number, fc: number): Exogenas {
  const { dow, mes } = partesFecha(iso);
  return [
    promo, school, fa, fb, fc,
    Math.sin((2 * Math.PI * dow) / 7), Math.cos((2 * Math.PI * dow) / 7),
    Math.sin((2 * Math.PI * (mes - 1)) / 12), Math.cos((2 * Math.PI * (mes - 1)) / 12),
  ];
}

/**
 * Pronóstico recursivo del escenario: cada predicción se agrega a la historia y alimenta
 * la siguiente ventana, igual que en la evaluación del backend.
 */
export async function pronosticarGru(meta: GruMeta, esc: Escenario): Promise<PuntoPronostico[]> {
  const { modelo } = await cargarGru(meta);
  const ventana = meta.ventana;
  const hist = meta.ultimos_dias.slice(-ventana);
  const fechasFut = Array.from({ length: esc.horizonte }, (_, i) => sumarDias(meta.ultima_fecha, i + 1));
  const iFestivo = esc.festivo ? diaFestivo(esc.horizonte) : -1;

  // Exógenas de toda la línea de tiempo: 30 días históricos + horizonte del escenario.
  const exog: Exogenas[] = [
    ...hist.map((d) => exogenas(d.fecha, d.promo, d.school_holiday, d.festivo_a, d.festivo_b, d.festivo_c)),
    ...fechasFut.map((f, i) => exogenas(f, promoEnFecha(esc.promo, f), esc.school ? 1 : 0, i === iFestivo ? 1 : 0, 0, 0)),
  ];
  const ventas: number[] = hist.map((d) => d.ventas_esc);
  const rango = meta.escalador_max - meta.escalador_min;

  for (let t = ventana; t < ventana + esc.horizonte; t++) {
    const x: number[][] = [];
    for (let k = 0; k < ventana; k++) x.push([ventas[t - ventana + k], ...exog[t - ventana + 1 + k]]);
    ventas.push(modelo.predecir(x)[0]);
  }
  return fechasFut.map((fecha, i) => ({ fecha, pred: Math.max(0, ventas[ventana + i] * rango + meta.escalador_min) }));
}
