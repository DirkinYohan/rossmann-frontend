// Definición de los escenarios de marketing, compartida por ARIMA (precalculado) y GRU (en vivo).
// Debe coincidir con rossmann-backend/src/modelo_arima/exportar_arima.py.

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

/** Clave del escenario precalculado de ARIMA. Sin festivo se recorta la trayectoria de 42 días. */
export function claveArima(e: Escenario): string {
  return `${e.promo}_${e.school ? "si" : "no"}_${e.festivo ? `h${e.horizonte}` : "no"}`;
}

/** Índice (0-based) del día festivo: la mitad del horizonte, igual que en el backend (h // 2). */
export const diaFestivo = (horizonte: number) => Math.floor(horizonte / 2);

/** Valor de Promo para una fecha según la opción elegida. */
export function promoEnFecha(opcion: OpcionPromo, iso: string): number {
  if (opcion === "sin") return 0;
  if (opcion === "todos") return 1;
  return partesFecha(iso).dow < 5 ? 1 : 0; // lunes (0) a viernes (4)
}
