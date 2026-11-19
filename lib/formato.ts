// Formatos numéricos y de fecha en español.

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });

export const euros = (v: number) => eur.format(v);
export const entero = (v: number) => num.format(v);
export const corto = (v: number) => compacto.format(v);
export const pct = (v: number, dec = 2) => `${v.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
export const pctSigno = (v: number, dec = 1) => `${v > 0 ? "+" : ""}${pct(v, dec)}`;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** Fecha ISO (AAAA-MM-DD) → partes en UTC, para evitar desfases por zona horaria. */
export function partesFecha(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return { anio: a, mes: m, dia: d, dow: (fecha.getUTCDay() + 6) % 7 }; // dow: 0 = lunes … 6 = domingo
}

export const fechaCorta = (iso: string) => {
  const { mes, dia } = partesFecha(iso);
  return `${dia} ${MESES[mes - 1]}`;
};
export const fechaLarga = (iso: string) => {
  const { anio, mes, dia, dow } = partesFecha(iso);
  return `${DIAS[dow]} ${dia} ${MESES[mes - 1]} ${anio}`;
};
export const mesAnio = (iso: string) => {
  const { anio, mes } = partesFecha(iso);
  return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
};

/** Suma `n` días a una fecha ISO. */
export function sumarDias(iso: string, n: number): string {
  const { anio, mes, dia } = partesFecha(iso);
  return new Date(Date.UTC(anio, mes - 1, dia + n)).toISOString().slice(0, 10);
}
