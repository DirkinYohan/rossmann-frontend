// Tipos de los JSON que exporta el backend (rossmann-backend/exports → public/).

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

export type PuntoTest = { fecha: string; real: number; abierto: number; pred: number };
export type PuntoTestArima = PuntoTest & { li: number; ls: number };
export type PuntoPronostico = { fecha: string; pred: number; li?: number; ls?: number };

export type SerieArima = {
  nombre: string;
  orden: number[];
  orden_estacional: number[];
  aic: number;
  coeficientes_exogenas: Record<string, number>;
  metricas: Metricas;
  test: PuntoTestArima[];
  futuro_inicio: string;
  escenarios: Record<string, PuntoPronostico[]>;
};
export type ArimaEscenarios = { horizonte: number; horizontes: number[]; series: Record<string, SerieArima> };

export type SerieGruResultado = {
  nombre: string;
  epocas_entrenadas: number;
  mejor_epoca: number;
  parametros: number;
  metricas: Metricas;
  test: PuntoTest[];
  futuro_base: PuntoPronostico[];
  historial: { loss: number[]; val_loss: number[] };
};
export type GruResultados = { ventana: number; features: string[]; series: Record<string, SerieGruResultado> };

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
export type GruConfigSerie = {
  nombre: string;
  onnx: string;
  escalador_min: number;
  escalador_max: number;
  ultimos_dias: DiaHistorico[];
  futuro_base: PuntoPronostico[];
};
export type GruConfig = {
  ventana: number;
  features: string[];
  horizonte: number;
  entrada: string;
  salida: string;
  series: Record<string, GruConfigSerie>;
};

export type FilaComparacion = {
  serie: string;
  nombre: string;
  test_inicio: string;
  test_fin: string;
  ARIMA: Metricas;
  GRU: Metricas;
  mejor: Record<NombreMetrica, Modelo>;
  mejor_global: Modelo;
};
export type Comparacion = {
  tabla: FilaComparacion[];
  victorias_por_metrica: Record<Modelo, number>;
  mape_promedio: Record<Modelo, number>;
  mejor_modelo_general: Modelo;
};

export type Prueba = {
  adf: { estadistico: number; p_valor: number; rezagos: number; criticos: Record<string, number> };
  kpss: { estadistico: number; p_valor: number; rezagos: number; criticos: Record<string, number> };
  adf_estacionaria: boolean;
  kpss_estacionaria: boolean;
};
export type Grupo = { grupo: string; venta_promedio: number; dias: number };
export type SerieEstacionalidad = {
  nombre: string;
  historico: { fecha: string; ventas: number; abierto: number }[];
  stl: { fecha: string; tendencia: number; estacional: number; residuo: number }[];
  fuerza_estacional_semanal: number;
  semanal: { dia: number; nombre: string; venta_promedio: number }[];
  mensual: { mes: number; nombre: string; venta_promedio: number }[];
  pruebas: {
    original: Prueba;
    diferencia_1: Prueba;
    diferencia_estacional_7: Prueba;
    interpretacion: string;
    d_sugerido: number;
    D_sugerido: number;
  };
  acf: { lag: number; valor: number }[];
  pacf: { lag: number; valor: number }[];
  banda_confianza: number;
  efectos: {
    promo: Grupo[];
    school_holiday: Grupo[];
    state_holiday: Grupo[];
    uplift_promo_pct: number | null;
    uplift_school_pct: number | null;
  };
};
export type Estacionalidad = { series: Record<string, SerieEstacionalidad> };
