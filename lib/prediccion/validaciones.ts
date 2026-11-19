// Validaciones del formulario de /prediccion. Devuelven mensajes en español (null = válido)
// para mostrarlos junto a cada campo sin bloquear el resto del formulario.

import type { DiaHistorial } from "./construirExogenas";

export const HORIZONTE_MIN = 1;
export const HORIZONTE_MAX = 42;
export const DIAS_HISTORIAL = 30;

/** Número de días: entero entre 1 y 42. */
export function validarHorizonte(texto: string): string | null {
  const t = texto.trim();
  if (t === "") return "Indica el número de días a predecir.";
  if (!/^-?\d+$/.test(t)) return "Debe ser un número entero (sin decimales).";
  const n = Number(t);
  if (n < HORIZONTE_MIN || n > HORIZONTE_MAX) return `Debe estar entre ${HORIZONTE_MIN} y ${HORIZONTE_MAX} días (6 semanas, el horizonte con que se evaluaron los modelos).`;
  return null;
}

export const horizonteValido = (texto: string) => validarHorizonte(texto) === null;

/** Al menos un modelo marcado. */
export function validarModelos(arima: boolean, gru: boolean): string | null {
  return arima || gru ? null : "Selecciona al menos un modelo.";
}

/** Error de una celda de venta del historial (null = válida). */
export function validarVenta(d: DiaHistorial): string | null {
  const t = d.ventas.trim();
  if (t === "") return "Falta la venta.";
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return "No es un número.";
  if (n < 0) return "No puede ser negativa.";
  if (!d.abierto && n !== 0) return "Día cerrado: la venta debe ser 0.";
  return null;
}

export type ResultadoHistorial = { general: string | null; porFila: (string | null)[] };

/** Historial propio: exactamente 30 valores numéricos ≥ 0, sin vacíos, y 0 en días cerrados. */
export function validarHistorial(filas: DiaHistorial[]): ResultadoHistorial {
  const porFila = filas.map(validarVenta);
  const errores = porFila.filter(Boolean).length;
  const vacias = filas.filter((f) => f.ventas.trim() === "").length;
  let general: string | null = null;
  if (filas.length !== DIAS_HISTORIAL) general = `El historial debe tener exactamente ${DIAS_HISTORIAL} días (tiene ${filas.length}).`;
  else if (vacias)
    general = `Hay ${DIAS_HISTORIAL - vacias} valores y se necesitan exactamente ${DIAS_HISTORIAL}: ${vacias === 1 ? "falta 1 venta" : `faltan ${vacias} ventas`}.`;
  else if (errores) general = `Hay ${errores} ${errores === 1 ? "día con un valor inválido" : "días con valores inválidos"} en el historial.`;
  else if (!filas.some((f) => f.abierto && Number(f.ventas) > 0)) general = "El historial necesita al menos un día abierto con ventas mayores que 0.";
  return { general, porFila };
}

/**
 * "Pegar desde Excel": acepta valores separados por saltos de línea o tabulaciones
 * (una columna o una fila copiada de una hoja de cálculo). Admite separador de miles con
 * punto y decimales con coma (formato español) o el formato inglés.
 */
export function parsearPegado(texto: string): { valores: string[] | null; error: string | null } {
  const celdas = texto
    .split(/[\t\r\n]+/)
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (celdas.length !== DIAS_HISTORIAL) {
    return { valores: null, error: `Se esperaban exactamente ${DIAS_HISTORIAL} valores y se pegaron ${celdas.length}.` };
  }
  const valores: string[] = [];
  for (const [i, c] of celdas.entries()) {
    const limpio = c.replace(/[€\s]/g, "");
    // "12.345,67" → 12345.67 ; "12,345.67" → 12345.67 ; "12345,6" → 12345.6
    const normal = /,\d{1,2}$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
    const n = Number(normal);
    if (normal === "" || !Number.isFinite(n)) return { valores: null, error: `El valor ${i + 1} («${c}») no es un número.` };
    if (n < 0) return { valores: null, error: `El valor ${i + 1} («${c}») es negativo; las ventas deben ser ≥ 0.` };
    valores.push(String(n));
  }
  return { valores, error: null };
}
