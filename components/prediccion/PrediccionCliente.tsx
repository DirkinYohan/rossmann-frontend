"use client";

// Página /prediccion: el usuario introduce sus propios datos y obtiene la predicción de
// ARIMA (Pyodide + .joblib) y GRU (TypeScript + .keras) con el mismo formulario, todo en
// el navegador. Reutiliza los módulos de carga e inferencia de lib/arima.ts y lib/gru.ts.

import { useEffect, useRef, useState } from "react";
import { Cargando, Encabezado, ErrorDatos, Panel } from "@/components/ui";
import { precargarArima, useEstadoPyodide, type EstadoPyodide } from "@/lib/arima";
import { cargarJson, RUTAS, useDatos } from "@/lib/datos";
import { sumarDias } from "@/lib/formato";
import { cargarGru } from "@/lib/gru";
import {
  generarCalendario,
  historialDesdeDataset,
  historialVacio,
  type DiaCalendario,
  type DiaHistorial,
} from "@/lib/prediccion/construirExogenas";
import { predecir, type FilaResultado } from "@/lib/prediccion/predecir";
import { DIAS_HISTORIAL, validarHistorial, validarHorizonte, validarModelos } from "@/lib/prediccion/validaciones";
import type { ArimaMeta, GruMeta, InfoSerie, MetricasJson, Modelo } from "@/lib/tipos";
import { FormularioGeneral } from "./FormularioGeneral";
import { HistorialReciente, type ModoHistorial } from "./HistorialReciente";
import { ResultadosPrediccion, type PuntoHistoria } from "./ResultadosPrediccion";
import { TablaCalendario } from "./TablaCalendario";

const DIAS_POR_DEFECTO = 14;
const MODELOS_POR_DEFECTO: Record<Modelo, boolean> = { ARIMA: true, GRU: true };

type Metas = { serie: string; arima: ArimaMeta; gru: GruMeta };
type Resultado = { filas: FilaResultado[]; historia: PuntoHistoria[]; modelos: Modelo[]; historialPropio: boolean; serie: string };

/** Avance aproximado de la carga de Pyodide por etapa (para la barra de progreso). */
const AVANCE_PYODIDE: Record<EstadoPyodide["etapa"], number> = { inactivo: 5, descargando: 25, paquetes: 55, modelo: 85, listo: 90, error: 0 };

function Paso({ n, titulo, descripcion, children }: { n: number; titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <Panel
      titulo={`Paso ${n} · ${titulo}`}
      descripcion={descripcion}
    >
      {children}
    </Panel>
  );
}

function BarraCarga({ pct, mensaje }: { pct: number; mensaje: string }) {
  return (
    <div className="min-w-0 flex-1" role="status" aria-live="polite">
      <p className="mb-1 text-sm font-medium">Cargando modelos…</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-borde" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full rounded-full bg-arima transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-tenue">{mensaje}</p>
    </div>
  );
}

export function PrediccionCliente() {
  const { datos, error, cargando } = useDatos<{ series: InfoSerie[]; metricas: MetricasJson }>({ series: RUTAS.series, metricas: RUTAS.metricas });
  const [serie, setSerie] = useState("total_cadena");
  const [metas, setMetas] = useState<Metas | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [listos, setListos] = useState<Record<string, true>>({});
  const pyodide = useEstadoPyodide();

  const [diasTexto, setDiasTexto] = useState(String(DIAS_POR_DEFECTO));
  const [dias, setDias] = useState(DIAS_POR_DEFECTO); // último número de días válido
  const [modelos, setModelos] = useState(MODELOS_POR_DEFECTO);
  const [calendario, setCalendario] = useState<DiaCalendario[]>([]);
  const [modo, setModo] = useState<ModoHistorial>("dataset");
  const [historial, setHistorial] = useState<DiaHistorial[] | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [errorPrediccion, setErrorPrediccion] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const refResultados = useRef<HTMLDivElement>(null);

  // Metadatos y modelos de la serie elegida: se cargan al entrar y al cambiar de serie.
  useEffect(() => {
    let activo = true;
    Promise.all([cargarJson<ArimaMeta>(RUTAS.arimaMeta(serie)), cargarJson<GruMeta>(RUTAS.gruMeta(serie))])
      .then(([arima, gru]) => {
        if (!activo) return;
        setMetas({ serie, arima, gru });
        const listo = (clave: string) => () => activo && setListos((l) => ({ ...l, [clave]: true }));
        const fallo = (e: Error) => activo && setErrorCarga(e.message);
        precargarArima(arima).then(listo(`ARIMA|${serie}`), fallo);
        cargarGru(gru).then(listo(`GRU|${serie}`), fallo);
      })
      .catch((e: Error) => activo && setErrorCarga(e.message));
    return () => {
      activo = false;
    };
  }, [serie]);

  const meta = metas?.serie === serie ? metas : null;
  const ultima = meta?.gru.ultima_fecha ?? null;

  // Calendario y historial visibles (derivados: se regeneran si cambia el número de días).
  const calendarioVisible =
    ultima && (calendario.length !== dias || calendario[0]?.fecha !== sumarDias(ultima, 1)) ? generarCalendario(ultima, dias, calendario) : calendario;
  const historialVisible = historial ?? (ultima ? historialVacio(ultima, DIAS_HISTORIAL) : []);

  // Validaciones (los errores se muestran junto a cada campo).
  const errorDias = validarHorizonte(diasTexto);
  const errorModelos = validarModelos(modelos.ARIMA, modelos.GRU);
  const validacionHistorial = modo === "propio" ? validarHistorial(historialVisible) : null;
  const historialMostrado =
    validacionHistorial && !intentado
      ? { general: null, porFila: validacionHistorial.porFila.map((e, i) => (historialVisible[i].ventas.trim() === "" ? null : e)) }
      : validacionHistorial;
  const errores = [errorDias, errorModelos, validacionHistorial?.general].filter(Boolean) as string[];

  // Estado de carga de los modelos seleccionados.
  const seleccionados = (["ARIMA", "GRU"] as Modelo[]).filter((m) => modelos[m]);
  const listoModelo = (m: Modelo) => Boolean(listos[`${m}|${serie}`]);
  const cargandoModelos = !meta || seleccionados.some((m) => !listoModelo(m));
  const avance =
    seleccionados.length === 0
      ? 100
      : seleccionados.reduce((s, m) => s + (listoModelo(m) ? 100 : m === "ARIMA" ? AVANCE_PYODIDE[pyodide.etapa] : 50), 0) / seleccionados.length;
  const mensajeCarga = !meta
    ? "Leyendo metadatos de la serie…"
    : modelos.ARIMA && !listoModelo("ARIMA")
      ? `${pyodide.mensaje || "Preparando Python (Pyodide)…"} La primera vez descarga ~30 MB; después queda en caché.`
      : "Cargando el GRU (.keras) y validándolo contra Python…";

  if (cargando) return <Cargando />;
  if (error || !datos) return <ErrorDatos mensaje={error ?? "Datos incompletos"} />;

  const cambiarDias = (texto: string) => {
    setDiasTexto(texto);
    if (!validarHorizonte(texto)) {
      setDias(Number(texto));
      if (ultima) setCalendario(generarCalendario(ultima, Number(texto), calendarioVisible));
    }
  };

  const cambiarSerie = (id: string) => {
    setSerie(id);
    setResultado(null);
    setHistorial(null); // el historial propio pertenece a la serie anterior
    setErrorPrediccion(null);
    setErrorCarga(null);
    setIntentado(false);
  };

  const nuevaPrediccion = () => {
    setDiasTexto(String(DIAS_POR_DEFECTO));
    setDias(DIAS_POR_DEFECTO);
    setModelos(MODELOS_POR_DEFECTO);
    setCalendario([]);
    setModo("dataset");
    setHistorial(null);
    setIntentado(false);
    setErrorPrediccion(null);
    setResultado(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ejecutar = async () => {
    setIntentado(true);
    if (errores.length || !meta || cargandoModelos) return;
    setCalculando(true);
    setErrorPrediccion(null);
    const propio = modo === "propio";
    try {
      const filas = await predecir({
        metaArima: meta.arima,
        metaGru: meta.gru,
        calendario: calendarioVisible,
        historial: propio ? historialVisible : null,
        modelos,
      });
      const historia: PuntoHistoria[] = propio
        ? historialVisible.map((d) => ({ fecha: d.fecha, real: d.abierto ? Number(d.ventas) : null }))
        : meta.gru.ventana_gru.map((d) => ({ fecha: d.fecha, real: d.abierto ? d.ventas : null }));
      setResultado({ filas, historia, modelos: seleccionados, historialPropio: propio, serie });
      requestAnimationFrame(() => refResultados.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setErrorPrediccion(e instanceof Error ? e.message : String(e));
    } finally {
      setCalculando(false);
    }
  };

  const infoSerie = datos.series.find((s) => s.id === serie);
  const fila = datos.metricas.series[serie];
  const mape: Partial<Record<Modelo, number>> = { ARIMA: fila?.ARIMA.MAPE, GRU: fila?.GRU.MAPE };

  return (
    <>
      <Encabezado titulo="Predicción personalizada">
        Introduce tus propios datos (calendario de promociones, vacaciones, festivos y, si quieres, tus ventas recientes) y obtén la predicción de ARIMA y GRU con el
        mismo formulario. Todo se calcula en tu navegador con los modelos reentrenados con la serie completa: no se envía nada a ningún servidor.
      </Encabezado>

      <div className="space-y-6">
        <Paso n={1} titulo="Datos generales">
          <FormularioGeneral
            series={datos.series}
            serie={serie}
            onSerie={cambiarSerie}
            infoTienda={meta?.gru.info_tienda ?? null}
            ultimaFecha={ultima}
            diasTexto={diasTexto}
            onDias={cambiarDias}
            errorDias={errorDias}
            modelos={modelos}
            onModelos={setModelos}
            errorModelos={errorModelos}
          />
        </Paso>

        <Paso
          n={2}
          titulo="Calendario día por día"
          descripcion="Marca qué días abre la tienda y en cuáles hay promoción, vacaciones escolares o un festivo. Un día cerrado vale 0 € y no puede tener promoción."
        >
          {calendarioVisible.length ? <TablaCalendario dias={calendarioVisible} onChange={setCalendario} /> : <Cargando texto="Preparando calendario…" />}
          {errorDias && <p className="mt-2 text-xs text-tenue">Mostrando el calendario de {dias} días hasta que corrijas el número de días.</p>}
        </Paso>

        <Paso n={3} titulo="Historial reciente (opcional)">
          <HistorialReciente
            modo={modo}
            onModo={setModo}
            filas={historialVisible}
            onFilas={setHistorial}
            onCargarDataset={() => meta && setHistorial(historialDesdeDataset(meta.gru))}
            validacion={historialMostrado}
          />
        </Paso>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-borde bg-superficie/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={ejecutar}
              disabled={cargandoModelos || calculando}
              className="rounded-lg bg-arima px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {calculando ? "Calculando…" : "Predecir"}
            </button>
            {cargandoModelos && seleccionados.length > 0 && !errorCarga ? (
              <BarraCarga pct={avance} mensaje={mensajeCarga} />
            ) : (
              <p className="text-sm text-tenue">
                {calculando
                  ? `Ejecutando ${seleccionados.join(" y ")} en el navegador…`
                  : `Modelos listos: ${seleccionados.join(" y ") || "ninguno seleccionado"}.`}
              </p>
            )}
          </div>
          {intentado && errores.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm text-red-700" role="alert">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {(errorCarga || errorPrediccion || pyodide.etapa === "error") && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
              {errorPrediccion ?? errorCarga ?? `Error al ejecutar ARIMA en Pyodide: ${pyodide.mensaje}`}
            </p>
          )}
        </div>

        <div ref={refResultados} className="scroll-mt-20">
          {resultado && resultado.serie === serie && (
            <ResultadosPrediccion
              filas={resultado.filas}
              historia={resultado.historia}
              modelos={resultado.modelos}
              mape={mape}
              nombreSerie={infoSerie?.nombre ?? serie}
              idSerie={serie}
              historialPropio={resultado.historialPropio}
              onNueva={nuevaPrediccion}
            />
          )}
        </div>
      </div>
    </>
  );
}
