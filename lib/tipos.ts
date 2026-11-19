// Tipos de los archivos que exporta el backend (rossmann-backend → public/data y public/models).

export type Metricas = { RMSE: number; MAE: number; MAPE: number };
export type NombreMetrica = keyof Metricas;
export type Modelo = "ARIMA" | "GRU";

export type InfoSerie = {
  id: string;
  store: number | null;
  store_type: string | null;
  criterio: string;
  nombre: string;
  dias: number;
  dias_interpolados: number;
};

export type PuntoPronostico = { fecha: string; pred: number; li?: number; ls?: number };

// ---------- metricas.json ----------
export type PuntoTest = {
  fecha: string;
  real: number;
  abierto: number;
  arima: number;
  arima_li: number;
  arima_ls: number;
  gru: number;
};
export type FilaMetricas = {
  serie: string;
  nombre: string;
  test_inicio: string;
  test_fin: string;
  ARIMA: Metricas;
  GRU: Metricas;
  mejor: Record<NombreMetrica, Modelo>;
  mejor_global: Modelo;
};
export type MetricasJson = {
  descripcion_metricas: Record<NombreMetrica, string>;
  tabla: FilaMetricas[];
  series: Record<string, FilaMetricas & { test: PuntoTest[] }>;
  victorias_por_metrica: Record<Modelo, number>;
  mape_promedio: Record<Modelo, number>;
  mejor_modelo_general: Modelo;
};

/** Ficha informativa de la tienda (vacía en "Total cadena"). No entra en los modelos. */
export type InfoTienda = {
  StoreType?: string | null;
  Assortment?: string | null;
  CompetitionDistance?: number | null;
  Promo2?: number | null;
};

// ---------- arima_meta_<serie>.json ----------
// El .joblib es el modelo REENTRENADO con la serie completa: pronostica desde ultima_fecha + 1.
export type ArimaMeta = {
  serie: string;
  nombre: string;
  archivo: string;
  orden: number[];
  orden_estacional: number[];
  exogenas: string[];
  frecuencia: string;
  ultima_fecha: string;
  ultima_fecha_entrenamiento: string;
  /** Días que guarda el .joblib compacto (= días del historial que reemplaza results.apply). */
  dias_ancla: number;
  fecha_ancla: string;
  aic: number;
  coeficientes_exogenas: Record<string, number>;
  mape_test: number;
  metricas_test: Metricas;
  periodo_test: { inicio: string; fin: string };
  info_tienda: InfoTienda;
  versiones: Record<string, string>;
  /** Pronóstico de 42 días calculado en Python con el mismo .joblib (para verificar Pyodide). */
  referencia: { descripcion: string; fechas: string[]; exog: number[][]; media: number[]; li: number[]; ls: number[] };
};

// ---------- gru_meta_<serie>.json y gru_referencia_<serie>.json ----------
/** Exógenas de un día tal como las usa el GRU (StateHoliday en one-hot a/b/c). */
export type ExogDia = {
  fecha: string;
  promo: number;
  school_holiday: number;
  festivo_a: number;
  festivo_b: number;
  festivo_c: number;
};
/** Día de la ventana inicial del GRU: exógenas + ventas escaladas. */
export type DiaVentana = ExogDia & { ventas_esc: number };
/** Día de ventana_gru en gru_meta_<serie>.json (ventas en días cerrados = valor interpolado). */
export type DiaHistorico = DiaVentana & { ventas: number; abierto: number; state_holiday: string };
export type GruMeta = {
  serie: string;
  nombre: string;
  archivo: string;
  ventana: number;
  features: string[];
  escalador_min: number;
  escalador_max: number;
  /**
   * Efecto multiplicativo de la promo (β). El GRU trabaja con la venta neutralizada
   * venta / (1 + β·promo) y con la columna promo en 0; la venta final = salida · (1 + β·promo).
   */
  ajuste_promo_beta: number;
  capas: Record<string, string | number | boolean>[];
  ultima_fecha: string;
  mape_test: number;
  metricas_test: Metricas;
  periodo_test: { inicio: string; fin: string };
  info_tienda: InfoTienda;
  ventana_gru: DiaHistorico[];
};
export type GruReferencia = {
  serie: string;
  tolerancia: number;
  casos: { fecha_objetivo: string; entrada: number[][]; salida: number }[];
};

// ---------- historicos.json ----------
export type Historicos = { series: Record<string, { fechas: string[]; ventas: number[]; abierto: number[] }> };

// ---------- estacionalidad_informe.json ----------
export type PruebaADF = {
  estadistico: number;
  p_valor: number;
  rezagos: number;
  valores_criticos: Record<string, number>;
  estacionaria: boolean;
};
export type PruebaKPSS = PruebaADF & { nota_p_valor?: string };
export type EfectoVariable = { grupos: Record<string, { venta_promedio: number; dias: number }>; efecto_pct: number | null };
export type InformeSerie = {
  nombre: string;
  n_observaciones: number;
  adf: PruebaADF;
  kpss: PruebaKPSS;
  caso: "estacionaria" | "no_estacionaria" | "estacionaria_en_tendencia" | "estacionaria_en_diferencias";
  conclusion: string;
  diferenciacion_recomendada: { d: number; D: number; periodo: number };
  pruebas_tras_diferencia_estacional: { adf: PruebaADF; kpss: PruebaKPSS };
  stl: { fechas: string[]; tendencia: number[]; estacional: number[]; residuo: number[] };
  fuerza_estacionalidad: number;
  promedio_por_dia_semana: Record<string, number>;
  promedio_por_mes: Record<string, number>;
  acf: { rezagos: number[]; valores: number[]; banda_confianza: number };
  pacf: { rezagos: number[]; valores: number[]; banda_confianza: number };
  efecto_variables_externas: { promo: EfectoVariable; school_holiday: EfectoVariable; state_holiday: EfectoVariable };
};
export type InformeEstacionalidad = { generado: string; alfa: number; max_rezago: number; series: Record<string, InformeSerie> };
