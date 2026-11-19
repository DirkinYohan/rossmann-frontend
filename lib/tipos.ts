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

// ---------- arima_meta_<serie>.json ----------
export type ArimaMeta = {
  serie: string;
  nombre: string;
  archivo: string;
  orden: number[];
  orden_estacional: number[];
  exogenas: string[];
  frecuencia: string;
  ultima_fecha_entrenamiento: string;
  aic: number;
  coeficientes_exogenas: Record<string, number>;
  versiones: Record<string, string>;
  test: { fechas: string[]; ventas: number[]; exog: number[][] };
  referencia_test: { media: number[]; li: number[]; ls: number[] };
};

// ---------- gru_meta_<serie>.json y gru_referencia_<serie>.json ----------
export type DiaHistorico = {
  fecha: string;
  ventas: number;
  ventas_esc: number;
  promo: number;
  school_holiday: number;
  festivo_a: number;
  festivo_b: number;
  festivo_c: number;
};
export type GruMeta = {
  serie: string;
  nombre: string;
  archivo: string;
  ventana: number;
  features: string[];
  escalador_min: number;
  escalador_max: number;
  capas: Record<string, string | number | boolean>[];
  ultima_fecha: string;
  ultimos_dias: DiaHistorico[];
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
