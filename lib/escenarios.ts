// Definición de los escenarios de marketing, compartida por ARIMA (Pyodide) y GRU (TypeScript).
// El festivo se coloca a mitad del horizonte y Promo «lunes a viernes» activa la promo de lunes a viernes.

import { partesFecha } from "./formato";

export type OpcionPromo = "sin" | "lv" | "todos";
export type Escenario = { promo: OpcionPromo; school: boolean; festivo: boolean; horizonte: number };

export const HORIZONTES = [7, 14, 28, 42] as const;
export const OPCIONES_PROMO: { valor: OpcionPromo; etiqueta: string }[] = [
  { valor: "sin", etiqueta: "Sin promo" },
  { valor: "lv", etiqueta: "Lunes a viernes" },
  { valor: "todos", etiqueta: "Todos los días" },
];

export const ESCENARIO_BASE = (horizonte: number): Escenario => ({ promo: "sin", school: false, festivo: false, horizonte });

/** Índice (0-based) del día festivo: la mitad del horizonte, (h // 2). */
export const diaFestivo = (horizonte: number) => Math.floor(horizonte / 2);

/** Valor de Promo para una fecha según la opción elegida. */
export function promoEnFecha(opcion: OpcionPromo, iso: string): number {
  if (opcion === "sin") return 0;
  if (opcion === "todos") return 1;
  return partesFecha(iso).dow < 5 ? 1 : 0; // lunes (0) a viernes (4)
}
