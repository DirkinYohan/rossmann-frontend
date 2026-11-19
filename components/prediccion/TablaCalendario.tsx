"use client";

// Paso 2 · Calendario día por día con las variables externas que verán los modelos.

import { Ayuda, Interruptor } from "@/components/ui";
import { fechaCorta, partesFecha } from "@/lib/formato";
import {
  diaPorDefecto,
  diaSemana,
  normalizarDia,
  OPCIONES_FESTIVO,
  type CodigoFestivo,
  type DiaCalendario,
} from "@/lib/prediccion/construirExogenas";

export const AYUDAS = {
  abierta: "Si la tienda abre ese día. Un día cerrado vende 0 €: no se le pide predicción al modelo y no puede tener promoción.",
  promo: "Promo: ese día la tienda tiene una promoción activa (descuentos). En el histórico, la promoción eleva claramente las ventas.",
  school: "SchoolHoliday: hay vacaciones escolares en la región de la tienda. Cambia el flujo de clientes.",
  festivo: "StateHoliday: festivo oficial del estado. Normalmente las tiendas cierran; si abren, la venta suele ser distinta. Pascua y Navidad son festivos especiales.",
  venta: "Venta total del día en euros. Si la tienda estuvo cerrada, escribe 0.",
} as const;

/** Cabecera de columna con su icono de ayuda. */
export function Cabecera({ texto, ayuda }: { texto: string; ayuda?: string }) {
  return (
    <th scope="col" className="whitespace-nowrap px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-tenue">
      <span className="inline-flex items-center gap-1">
        {texto} {ayuda && <Ayuda texto={ayuda} />}
      </span>
    </th>
  );
}

/** Celdas editables de un día (abierta, promo, vacaciones, festivo), compartidas con el historial. */
export function CeldasDia<T extends DiaCalendario>({ dia, onChange }: { dia: T; onChange: (d: T) => void }) {
  const fijar = (cambios: Partial<DiaCalendario>) => onChange(normalizarDia({ ...dia, ...cambios }));
  const etiqueta = fechaCorta(dia.fecha);
  return (
    <>
      <td className="px-2 py-1.5">
        <Interruptor etiqueta={`Tienda abierta el ${etiqueta}`} activo={dia.abierto} onChange={(v) => fijar({ abierto: v })} />
      </td>
      <td className="px-2 py-1.5">
        <Interruptor etiqueta={`Promoción el ${etiqueta}`} activo={dia.promo} deshabilitado={!dia.abierto} onChange={(v) => fijar({ promo: v })} />
      </td>
      <td className="px-2 py-1.5">
        <Interruptor etiqueta={`Vacaciones escolares el ${etiqueta}`} activo={dia.school} onChange={(v) => fijar({ school: v })} />
      </td>
      <td className="px-2 py-1.5">
        <select
          aria-label={`Festivo estatal el ${etiqueta}`}
          value={dia.festivo}
          onChange={(e) => fijar({ festivo: e.target.value as CodigoFestivo })}
          className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-arima/40"
        >
          {OPCIONES_FESTIVO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}

export function CeldasFecha({ fecha }: { fecha: string }) {
  const domingo = partesFecha(fecha).dow === 6;
  return (
    <>
      <td className="tabular whitespace-nowrap px-2 py-1.5 font-medium">{fecha.split("-").reverse().join("/")}</td>
      <td className={`whitespace-nowrap px-2 py-1.5 ${domingo ? "text-tenue" : ""}`}>{diaSemana(fecha)}</td>
    </>
  );
}

function BotonRapido({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-borde bg-superficie px-2.5 py-1 text-xs font-medium hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-arima/40"
    >
      {children}
    </button>
  );
}

export function TablaCalendario({ dias, onChange }: { dias: DiaCalendario[]; onChange: (d: DiaCalendario[]) => void }) {
  const aplicar = (f: (d: DiaCalendario) => Partial<DiaCalendario>) => onChange(dias.map((d) => normalizarDia({ ...d, ...f(d) })));
  const abiertos = dias.filter((d) => d.abierto).length;
  const conPromo = dias.filter((d) => d.promo).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-tenue">Llenado rápido</span>
        <BotonRapido onClick={() => aplicar((d) => ({ promo: partesFecha(d.fecha).dow < 5 }))}>Promo lunes a viernes</BotonRapido>
        <BotonRapido onClick={() => aplicar(() => ({ promo: true }))}>Promo todos los días</BotonRapido>
        <BotonRapido onClick={() => aplicar(() => ({ promo: false }))}>Quitar promociones</BotonRapido>
        <BotonRapido onClick={() => aplicar(() => ({ school: true }))}>Todo vacaciones escolares</BotonRapido>
        <BotonRapido onClick={() => onChange(dias.map((d) => diaPorDefecto(d.fecha)))}>Restablecer</BotonRapido>
        <span className="ml-auto text-xs text-tenue">
          {abiertos} {abiertos === 1 ? "día abierto" : "días abiertos"} · {conPromo} con promoción
        </span>
      </div>
      <div className="max-h-[440px] overflow-auto rounded-lg border border-borde">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <Cabecera texto="Fecha" />
              <Cabecera texto="Día" />
              <Cabecera texto="¿Abierta?" ayuda={AYUDAS.abierta} />
              <Cabecera texto="¿Promoción?" ayuda={AYUDAS.promo} />
              <Cabecera texto="¿Vacaciones escolares?" ayuda={AYUDAS.school} />
              <Cabecera texto="Festivo estatal" ayuda={AYUDAS.festivo} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {dias.map((d, i) => (
              <tr key={d.fecha} className={d.abierto ? "" : "bg-background/60"}>
                <CeldasFecha fecha={d.fecha} />
                <CeldasDia dia={d} onChange={(nuevo) => onChange(dias.map((x, j) => (j === i ? nuevo : x)))} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
