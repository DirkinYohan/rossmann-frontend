"use client";

// Cargador de modelos Keras 3 (.keras) y forward pass en TypeScript.
//
// Un archivo .keras es un ZIP con:
//   config.json        arquitectura (lista de capas del modelo funcional)
//   model.weights.h5   pesos en HDF5
// Se descomprime con jszip, se lee la arquitectura de config.json y los pesos con h5wasm.
//
// Dentro del .h5 Keras 3 NO usa el nombre de la capa del config, sino un nombre automático
// por clase y orden de aparición: layers/gru, layers/gru_1, layers/dense, layers/dense_1…
// Pesos de cada capa:
//   GRU   → layers/<gru>/cell/vars/0 kernel (entrada, 3u)
//           layers/<gru>/cell/vars/1 recurrent_kernel (u, 3u)
//           layers/<gru>/cell/vars/2 bias (2, 3u): fila 0 = bias de entrada, fila 1 = bias recurrente
//   Dense → layers/<dense>/vars/0 kernel (entrada, salida), vars/1 bias (salida)
// Columnas del GRU en el orden de Keras: [z | r | h].

import type JSZipTipo from "jszip";

type Activacion = (v: number) => number;
const ACTIVACIONES: Record<string, Activacion> = {
  linear: (v) => v,
  relu: (v) => (v > 0 ? v : 0),
  tanh: Math.tanh,
  sigmoid: (v) => 1 / (1 + Math.exp(-v)),
};

type CapaGRU = {
  tipo: "GRU";
  nombre: string;
  unidades: number;
  entrada: number;
  devolverSecuencia: boolean;
  kernel: Float32Array; // (entrada, 3u) fila mayor
  recurrente: Float32Array; // (u, 3u)
  biasEntrada: Float32Array; // (3u)
  biasRecurrente: Float32Array; // (3u)
  activacion: Activacion;
  activacionRecurrente: Activacion;
};
type CapaDense = { tipo: "Dense"; nombre: string; entrada: number; salida: number; kernel: Float32Array; bias: Float32Array; activacion: Activacion };
type CapaIdentidad = { tipo: "Identidad"; nombre: string };
type Capa = CapaGRU | CapaDense | CapaIdentidad;

export type ModeloKeras = {
  capas: Capa[];
  forma: [number, number]; // (pasos, features)
  resumen: string[];
  /** Ejecuta el modelo sobre UNA secuencia (pasos × features) y devuelve la salida. */
  predecir: (secuencia: ArrayLike<number>[]) => Float64Array;
};

/** Nombre automático que Keras 3 usa en model.weights.h5 (InputLayer → input_layer, GRU → gru…). */
function nombreH5(clase: string, contador: Map<string, number>): string {
  const base = clase.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const n = contador.get(base) ?? 0;
  contador.set(base, n + 1);
  return n === 0 ? base : `${base}_${n}`;
}

type ConfigCapa = { class_name: string; config: Record<string, unknown> & { name: string } };

/** Descarga y carga un modelo .keras. */
export async function cargarKeras(url: string): Promise<ModeloKeras> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se encontró ${url} (HTTP ${resp.status})`);
  const [{ default: JSZip }, h5wasm] = await Promise.all([import("jszip"), import("h5wasm")]);

  // 1) Descomprimir el ZIP
  const zip: JSZipTipo = await JSZip.loadAsync(await resp.arrayBuffer());
  const configTxt = await zip.file("config.json")?.async("string");
  const pesos = await zip.file("model.weights.h5")?.async("uint8array");
  if (!configTxt || !pesos) throw new Error(`${url} no contiene config.json y model.weights.h5`);

  // 2) Arquitectura
  const config = JSON.parse(configTxt) as { config: { layers: ConfigCapa[] } };
  const capasConfig = config.config.layers;

  // 3) Pesos con h5wasm (sistema de archivos virtual de Emscripten)
  const Module = await h5wasm.ready;
  const archivo = `/pesos_${Math.random().toString(36).slice(2)}.h5`;
  Module.FS!.writeFile(archivo, pesos);
  const f = new h5wasm.File(archivo, "r");
  const leer = (ruta: string): { valores: Float32Array; forma: number[] } => {
    const ds = f.get(ruta) as InstanceType<typeof h5wasm.Dataset> | null;
    if (!ds || !("value" in ds)) throw new Error(`Falta el peso ${ruta} en model.weights.h5`);
    return { valores: Float32Array.from(ds.value as ArrayLike<number>), forma: ds.shape ?? [] };
  };

  try {
    const contador = new Map<string, number>();
    const capas: Capa[] = [];
    const resumen: string[] = [];
    let forma: [number, number] = [0, 0];
    let dimActual = 0;

    for (const capa of capasConfig) {
      const c = capa.config;
      const ruta = `layers/${nombreH5(capa.class_name, contador)}`;
      switch (capa.class_name) {
        case "InputLayer": {
          const shape = (c.batch_shape ?? c.batch_input_shape) as (number | null)[];
          forma = [Number(shape[1]), Number(shape[2])];
          dimActual = forma[1];
          resumen.push(`Input(${forma.join("×")})`);
          break;
        }
        case "GRU": {
          if (c.reset_after !== true) throw new Error(`La capa ${c.name} no usa reset_after=True`);
          if (c.use_bias === false) throw new Error(`La capa ${c.name} no tiene bias`);
          const u = Number(c.units);
          const k = leer(`${ruta}/cell/vars/0`);
          const rk = leer(`${ruta}/cell/vars/1`);
          const b = leer(`${ruta}/cell/vars/2`);
          if (k.forma[0] !== dimActual || k.forma[1] !== 3 * u) throw new Error(`Forma inesperada del kernel de ${c.name}: ${k.forma}`);
          capas.push({
            tipo: "GRU", nombre: c.name, unidades: u, entrada: dimActual,
            devolverSecuencia: Boolean(c.return_sequences),
            kernel: k.valores, recurrente: rk.valores,
            biasEntrada: b.valores.subarray(0, 3 * u), biasRecurrente: b.valores.subarray(3 * u, 6 * u),
            activacion: ACTIVACIONES[String(c.activation)], activacionRecurrente: ACTIVACIONES[String(c.recurrent_activation)],
          });
          if (!ACTIVACIONES[String(c.activation)] || !ACTIVACIONES[String(c.recurrent_activation)]) throw new Error(`Activación no soportada en ${c.name}`);
          resumen.push(`GRU(${u}${c.return_sequences ? ", seq" : ""})`);
          dimActual = u;
          break;
        }
        case "Dropout": // en inferencia es la identidad
          capas.push({ tipo: "Identidad", nombre: c.name });
          resumen.push(`Dropout(${c.rate})`);
          break;
        case "Dense": {
          const w = leer(`${ruta}/vars/0`);
          const b = leer(`${ruta}/vars/1`);
          const act = ACTIVACIONES[String(c.activation)];
          if (!act) throw new Error(`Activación no soportada en ${c.name}: ${c.activation}`);
          capas.push({ tipo: "Dense", nombre: c.name, entrada: w.forma[0], salida: w.forma[1], kernel: w.valores, bias: b.valores, activacion: act });
          resumen.push(`Dense(${w.forma[1]}${c.activation !== "linear" ? `, ${c.activation}` : ""})`);
          dimActual = w.forma[1];
          break;
        }
        default:
          throw new Error(`Capa no soportada en el navegador: ${capa.class_name}`);
      }
    }
    return { capas, forma, resumen, predecir: (x) => forward(capas, x) };
  } finally {
    f.close();
    Module.FS!.unlink(archivo);
  }
}

/** Paso de una capa GRU sobre toda la secuencia (convención Keras, reset_after=True). */
function gru(capa: CapaGRU, secuencia: Float64Array[]): Float64Array[] {
  const u = capa.unidades;
  const n = capa.entrada;
  const k = capa.kernel;
  const rk = capa.recurrente;
  let h = new Float64Array(u);
  const salidas: Float64Array[] = [];
  const mx = new Float64Array(3 * u);
  const mh = new Float64Array(3 * u);

  for (const x of secuencia) {
    // matrix_x = x · kernel + bias_entrada      matrix_h = h · recurrent_kernel + bias_recurrente
    for (let j = 0; j < 3 * u; j++) {
      mx[j] = capa.biasEntrada[j];
      mh[j] = capa.biasRecurrente[j];
    }
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      const fila = i * 3 * u;
      for (let j = 0; j < 3 * u; j++) mx[j] += xi * k[fila + j];
    }
    for (let i = 0; i < u; i++) {
      const hi = h[i];
      if (hi === 0) continue;
      const fila = i * 3 * u;
      for (let j = 0; j < 3 * u; j++) mh[j] += hi * rk[fila + j];
    }
    const nuevo = new Float64Array(u);
    for (let j = 0; j < u; j++) {
      const z = capa.activacionRecurrente(mx[j] + mh[j]); // gate de actualización
      const r = capa.activacionRecurrente(mx[u + j] + mh[u + j]); // gate de reinicio
      const hh = capa.activacion(mx[2 * u + j] + r * mh[2 * u + j]); // candidato (reset después de la matmul)
      nuevo[j] = z * h[j] + (1 - z) * hh;
    }
    h = nuevo;
    if (capa.devolverSecuencia) salidas.push(h);
  }
  return capa.devolverSecuencia ? salidas : [h];
}

function dense(capa: CapaDense, x: Float64Array): Float64Array {
  const y = new Float64Array(capa.salida);
  for (let j = 0; j < capa.salida; j++) y[j] = capa.bias[j];
  for (let i = 0; i < capa.entrada; i++) {
    const xi = x[i];
    const fila = i * capa.salida;
    for (let j = 0; j < capa.salida; j++) y[j] += xi * capa.kernel[fila + j];
  }
  for (let j = 0; j < capa.salida; j++) y[j] = capa.activacion(y[j]);
  return y;
}

function forward(capas: Capa[], entrada: ArrayLike<number>[]): Float64Array {
  let secuencia: Float64Array[] = entrada.map((paso) => Float64Array.from(paso));
  for (const capa of capas) {
    if (capa.tipo === "GRU") secuencia = gru(capa, secuencia);
    else if (capa.tipo === "Dense") secuencia = secuencia.map((v) => dense(capa, v));
  }
  return secuencia[secuencia.length - 1];
}
