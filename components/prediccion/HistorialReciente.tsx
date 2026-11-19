"use client";

// Paso 3 · Historial reciente (opcional): el del dataset o las ventas del usuario.

import { useState } from "react";
import { ErrorCampo, Segmentado } from "@/components/ui";
import { fechaLarga } from "@/lib/formato";
import type { DiaHistorial } from "@/lib/prediccion/construirExogenas";
import { DIAS_HISTORIAL, parsearPegado, type ResultadoHistorial } from "@/lib/prediccion/validaciones";
import { AYUDAS, Cabecera, CeldasDia, CeldasFecha } from "./TablaCalendario";

export type ModoHistorial = "dataset" | "propio";

function PegarDesdeExcel({ onAplicar, onCerrar }: { onAplicar: (valores: string[]) => void; onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const aplicar = () => {
    const r = parsearPegado(texto);
    if (r.error) return setError(r.error);
    onAplicar(r.valores!);
    onCerrar();
  };
  return (
    <div className="mb-3 rounded-lg border border-borde bg-background p-3">
      <label className="block text-sm font-medium" htmlFor="pegar-excel">
        Pega aquí {DIAS_HISTORIAL} ventas (una columna o una fila copiada de Excel, del día más antiguo al más reciente)
      </label>
      <textarea
        id="pegar-excel"
        rows={4}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setError(null);
        }}
        placeholder={"18250\n17920\n0\n…"}
        className="tabular mt-2 w-full rounded-md border border-borde bg-superficie p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-arima/40"
      />
      <ErrorCampo mensaje={error} />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={aplicar} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-white">
          Aplicar valores
        </button>
        <button type="button" onClick={onCerrar} className="rounded-md border border-borde bg-superficie px-3 py-1.5 text-xs font-medium">
          Cancelar
        </button>
      </div>
      <p className="mt-2 text-xs text-tenue">Una venta 0 marca el día como cerrado y una venta mayor que 0 como abierto.</p>
    </div>
  );
}

export function HistorialReciente({
  modo,
  onModo,
  filas,
  onFilas,
  onCargarDataset,
  validacion,
}: {
  modo: ModoHistorial;
  onModo: (m: ModoHistorial) => void;
  filas: DiaHistorial[];
  onFilas: (f: DiaHistorial[]) => void;
  onCargarDataset: () => void;
  validacion: ResultadoHistorial | null;
}) {
  const [pegando, setPegando] = useState(false);

  const cambiarFila = (i: number, nueva: DiaHistorial) => {
    // Al marcar un día como cerrado su venta pasa a 0 (regla del formulario).
    const ajustada = !nueva.abierto && filas[i].abierto ? { ...nueva, ventas: "0" } : nueva;
    onFilas(filas.map((f, j) => (j === i ? ajustada : f)));
  };
  // Venta > 0 implica tienda abierta; venta 0 se interpreta como día cerrado.
  const pegar = (valores: string[]) =>
    onFilas(
      filas.map((f, i) => {
        const abierto = Number(valores[i]) > 0;
        return { ...f, ventas: valores[i], abierto, promo: abierto && f.promo };
      }),
    );

  return (
    <div>
      <div className="max-w-xl">
        <Segmentado<ModoHistorial>
          etiqueta="Punto de partida de los modelos"
          valor={modo}
          onChange={onModo}
          opciones={[
            { valor: "dataset", etiqueta: "Usar historial del dataset" },
            { valor: "propio", etiqueta: "Ingresar mis ventas recientes" },
          ]}
        />
      </div>

      {modo === "dataset" ? (
        <p className="mt-3 text-sm text-tenue">
          Se usan los últimos {DIAS_HISTORIAL} días reales del dataset: la ventana inicial del GRU y el estado final del modelo ARIMA reentrenado.
        </p>
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-sm text-tenue">
            {filas.length > 0 && `Del ${fechaLarga(filas[0].fecha)} al ${fechaLarga(filas[filas.length - 1].fecha)}. `}
            GRU usa estas ventas como ventana inicial (escaladas con el mismo MinMax del entrenamiento). ARIMA conserva sus parámetros y actualiza su estado con ellas
            (<code className="text-xs">results.apply</code>), sin reentrenar.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPegando(true)}
              className="rounded-md border border-borde bg-superficie px-2.5 py-1 text-xs font-medium hover:bg-background"
            >
              Pegar desde Excel
            </button>
            <button type="button" onClick={onCargarDataset} className="rounded-md border border-borde bg-superficie px-2.5 py-1 text-xs font-medium hover:bg-background">
              Cargar valores del dataset
            </button>
          </div>
          {pegando && <PegarDesdeExcel onAplicar={pegar} onCerrar={() => setPegando(false)} />}
          <ErrorCampo mensaje={validacion?.general} />
          <div className="mt-2 max-h-[440px] overflow-auto rounded-lg border border-borde">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <Cabecera texto="Fecha" />
                  <Cabecera texto="Día" />
                  <Cabecera texto="Venta en €" ayuda={AYUDAS.venta} />
                  <Cabecera texto="¿Abierta?" ayuda={AYUDAS.abierta} />
                  <Cabecera texto="Promo" ayuda={AYUDAS.promo} />
                  <Cabecera texto="SchoolHoliday" ayuda={AYUDAS.school} />
                  <Cabecera texto="StateHoliday" ayuda={AYUDAS.festivo} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((f, i) => {
                  const error = validacion?.porFila[i];
                  return (
                    <tr key={f.fecha} className={f.abierto ? "" : "bg-background/60"}>
                      <CeldasFecha fecha={f.fecha} />
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={f.ventas}
                          aria-label={`Venta del ${f.fecha}`}
                          aria-invalid={Boolean(error)}
                          onChange={(e) => cambiarFila(i, { ...f, ventas: e.target.value })}
                          className={`tabular w-28 rounded-md border bg-superficie px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-arima/40 ${
                            error ? "border-red-400" : "border-borde"
                          }`}
                        />
                        {error && <p className="mt-0.5 text-[11px] font-medium text-red-700">{error}</p>}
                      </td>
                      <CeldasDia dia={f} onChange={(d) => cambiarFila(i, d)} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
