"use client";

// Inferencia del GRU en el navegador con onnxruntime-web.
// Replica EXACTAMENTE la construcción de ventanas de rossmann-backend/src/modelo_gru/entrenar_gru.py:
//   paso k (0..29) para predecir el día t = [ventas_esc(t-30+k), exógenas(t-29+k)]
//   exógenas = promo, school_holiday, festivo_a, festivo_b, festivo_c,
//              sin/cos(2π·dow/7) (dow 0 = lunes), sin/cos(2π·(mes-1)/12)

import type { InferenceSession } from "onnxruntime-web";
import { diaFestivo, promoEnFecha, type Escenario } from "./escenarios";
import { partesFecha, sumarDias } from "./formato";
import type { GruConfig, PuntoPronostico } from "./tipos";

type Ort = typeof import("onnxruntime-web");

let ortPromesa: Promise<Ort> | null = null;
const sesiones = new Map<string, Promise<InferenceSession>>();

/** Carga onnxruntime-web solo en el navegador. Los .wasm se sirven desde /ort (copiados en postinstall). */
function cargarOrt(): Promise<Ort> {
  if (!ortPromesa) {
    ortPromesa = import("onnxruntime-web/wasm").then((ort) => {
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = 1; // sin hilos: no requiere cabeceras COOP/COEP
      return ort as unknown as Ort;
    });
  }
  return ortPromesa;
}

function sesion(archivo: string): Promise<InferenceSession> {
  if (!sesiones.has(archivo)) {
    const p = cargarOrt().then((ort) =>
      ort.InferenceSession.create(`/models/${archivo}`, { executionProviders: ["wasm"] }),
    );
    p.catch(() => sesiones.delete(archivo));
    sesiones.set(archivo, p);
  }
  return sesiones.get(archivo)!;
}

type Exogenas = [number, number, number, number, number, number, number, number, number];

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
export async function pronosticarGru(config: GruConfig, idSerie: string, esc: Escenario): Promise<PuntoPronostico[]> {
  const cfg = config.series[idSerie];
  const ventana = config.ventana;
  const nF = config.features.length;
  const s = await sesion(cfg.onnx);
  const ort = await cargarOrt();

  const hist = cfg.ultimos_dias.slice(-ventana);
  const ultimaFecha = hist[hist.length - 1].fecha;
  const fechasFut = Array.from({ length: esc.horizonte }, (_, i) => sumarDias(ultimaFecha, i + 1));
  const iFestivo = esc.festivo ? diaFestivo(esc.horizonte) : -1;

  // Exógenas de toda la línea de tiempo: 30 días históricos + horizonte del escenario.
  const exog: Exogenas[] = [
    ...hist.map((d) => exogenas(d.fecha, d.promo, d.school_holiday, d.festivo_a, d.festivo_b, d.festivo_c)),
    ...fechasFut.map((f, i) =>
      exogenas(f, promoEnFecha(esc.promo, f), esc.school ? 1 : 0, i === iFestivo ? 1 : 0, 0, 0),
    ),
  ];
  const ventas: number[] = hist.map((d) => d.ventas_esc);
  const rango = cfg.escalador_max - cfg.escalador_min;

  for (let t = ventana; t < ventana + esc.horizonte; t++) {
    const x = new Float32Array(ventana * nF);
    for (let k = 0; k < ventana; k++) {
      x[k * nF] = ventas[t - ventana + k];
      x.set(exog[t - ventana + 1 + k], k * nF + 1);
    }
    const tensor = new ort.Tensor("float32", x, [1, ventana, nF]);
    const salida = await s.run({ [config.entrada]: tensor });
    ventas.push(Number((salida[config.salida].data as Float32Array)[0]));
  }

  return fechasFut.map((fecha, i) => ({
    fecha,
    pred: Math.max(0, ventas[ventana + i] * rango + cfg.escalador_min),
  }));
}
