// Descarga de la tabla de resultados de /prediccion como CSV (separador «;» y coma decimal,
// que es lo que espera Excel con configuración regional en español). Se genera en el navegador.

import type { FilaResultado } from "./predecir";
import { diaSemana, OPCIONES_FESTIVO } from "./construirExogenas";

const num = (v: number | undefined) => (v === undefined ? "" : v.toFixed(2).replace(".", ","));
const siNo = (b: boolean) => (b ? "Sí" : "No");
const escapar = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function construirCsv(filas: FilaResultado[]): string {
  const cabecera = [
    "Fecha", "Día", "Abierta", "Promo", "Vacaciones escolares", "Festivo estatal",
    "Venta ARIMA (€)", "IC 95% inferior (€)", "IC 95% superior (€)", "Venta GRU (€)",
    "Base ARIMA (€)", "Base GRU (€)",
  ];
  const lineas = filas.map((f) =>
    [
      f.fecha, diaSemana(f.fecha), siNo(f.dia.abierto), siNo(f.dia.promo), siNo(f.dia.school),
      OPCIONES_FESTIVO.find((o) => o.valor === f.dia.festivo)?.etiqueta ?? "",
      num(f.arima), num(f.li), num(f.ls), num(f.gru), num(f.arimaBase), num(f.gruBase),
    ].map((c) => escapar(String(c))).join(";"),
  );
  return [cabecera.join(";"), ...lineas].join("\r\n");
}

/** Descarga el CSV (con BOM para que Excel reconozca UTF-8 y las tildes). */
export function descargarCsv(filas: FilaResultado[], nombreArchivo: string): void {
  const blob = new Blob(["﻿" + construirCsv(filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
