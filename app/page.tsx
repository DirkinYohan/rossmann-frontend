import Link from "next/link";
import { InicioResumen } from "@/components/InicioResumen";

const SECCIONES = [
  {
    href: "/dashboard",
    titulo: "Dashboard de predicción",
    texto: "Métricas RMSE, MAE y MAPE de ARIMA y GRU, ventas reales frente a predicciones y pronóstico a 6 semanas.",
  },
  {
    href: "/escenarios",
    titulo: "Simulación de escenarios",
    texto: "Combina promociones, vacaciones escolares y festivos y compara contra el escenario base. ARIMA y GRU predicen en vivo en tu navegador.",
  },
  {
    href: "/temporal",
    titulo: "Visualización temporal",
    texto: "Informe de estacionariedad (ADF/KPSS), descomposición STL, ACF/PACF, serie histórica con zoom y efecto de las variables externas.",
  },
];

export default function Inicio() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl pt-2">
        <p className="text-sm font-medium text-arima">Minería de Datos · Series de tiempo</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Predicción de ventas de Rossmann con SARIMAX y redes GRU
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-tenue">
          Modelos entrenados con los datos históricos de 1.115 tiendas (enero 2013 – julio 2015) para estimar la demanda de las próximas 6 semanas
          e integrar variables externas —promociones, vacaciones escolares y festivos— en la planificación de marketing. Los dos modelos se evalúan
          sobre los mismos 42 días finales, que nunca vieron durante el entrenamiento. Los modelos entrenados (.joblib y .keras) se ejecutan directamente en tu navegador: no hay servidor.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-borde bg-superficie p-5 transition-colors hover:border-foreground/30"
          >
            <h2 className="font-semibold tracking-tight">
              {s.titulo} <span className="inline-block text-tenue transition-transform group-hover:translate-x-0.5">→</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-tenue">{s.texto}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Resultados</h2>
        <InicioResumen />
      </section>
    </div>
  );
}
