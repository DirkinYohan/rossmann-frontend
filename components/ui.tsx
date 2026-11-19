// Piezas de interfaz reutilizables (tarjetas, estados de carga, controles segmentados).
import type { ReactNode } from "react";

export function Panel({
  titulo,
  descripcion,
  children,
  accion,
  className = "",
}: {
  titulo?: string;
  descripcion?: ReactNode;
  children: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-borde bg-superficie p-4 sm:p-5 ${className}`}>
      {(titulo || accion) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>}
            {descripcion && <p className="mt-1 text-sm text-tenue">{descripcion}</p>}
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{titulo}</h1>
      {children && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-tenue">{children}</p>}
    </div>
  );
}

export function Cargando({ texto = "Cargando datos…" }: { texto?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-tenue" role="status">
      <span className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-borde border-t-arima" />
      {texto}
    </div>
  );
}

export function ErrorDatos({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <p className="font-semibold">No se pudieron cargar los datos</p>
      <p className="mt-1">{mensaje}</p>
      <p className="mt-3 text-red-800">
        Ejecuta <code className="rounded bg-red-100 px-1">python run_all.py</code> en{" "}
        <code className="rounded bg-red-100 px-1">rossmann-backend/</code> para generar{" "}
        <code className="rounded bg-red-100 px-1">public/data</code> y <code className="rounded bg-red-100 px-1">public/models</code>.
      </p>
    </div>
  );
}

/** Control segmentado accesible (grupo de botones con un único valor activo). */
export function Segmentado<T extends string | number | boolean>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-tenue">{etiqueta}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-background p-1">
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={String(o.valor)}
              type="button"
              aria-pressed={activo}
              onClick={() => onChange(o.valor)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                activo ? "bg-superficie font-medium text-foreground shadow-sm ring-1 ring-borde" : "text-tenue hover:text-foreground"
              }`}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Leyenda({ items }: { items: { color: string; texto: string; tipo?: "linea" | "banda" | "punteada" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenue">
      {items.map((i) => (
        <li key={i.texto} className="flex items-center gap-1.5">
          {i.tipo === "banda" ? (
            <span className="h-2.5 w-4 rounded-sm" style={{ background: i.color, opacity: 0.18 }} />
          ) : (
            <span
              className="h-0 w-4"
              style={{ borderTop: `2px ${i.tipo === "punteada" ? "dashed" : "solid"} ${i.color}` }}
            />
          )}
          {i.texto}
        </li>
      ))}
    </ul>
  );
}
