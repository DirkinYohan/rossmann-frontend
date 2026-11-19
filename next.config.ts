import type { NextConfig } from "next";

// Tipos MIME de los artefactos que se sirven desde public/ y que el navegador ejecuta:
//   .wasm   → WebAssembly (necesario para compilarlo en streaming)
//   .joblib → modelos SARIMAX que carga Pyodide
//   .keras  → modelos GRU (ZIP con config.json + model.weights.h5)
const TIPOS = [
  { extension: "wasm", tipo: "application/wasm" },
  { extension: "joblib", tipo: "application/octet-stream" },
  { extension: "keras", tipo: "application/zip" },
];

// `npm run build:estatico` genera un sitio 100 % estático en out/ (sin servidor Node) que se
// puede publicar en cualquier hosting de archivos. La exportación estática no admite
// Cache Components/PPR ni headers(): el hosting debe servir .wasm como application/wasm
// (lo hacen casi todos por defecto).
const exportarEstatico = process.env.EXPORTAR_ESTATICO === "1";

const comun: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const nextConfig: NextConfig = exportarEstatico
  ? // trailingSlash genera dashboard/index.html, etc.: funciona en cualquier servidor de archivos.
    { ...comun, output: "export", trailingSlash: true }
  : {
      ...comun,
      cacheComponents: true,
      partialPrefetching: true,
      async headers() {
        return TIPOS.map(({ extension, tipo }) => ({
          source: `/:ruta*.${extension}`,
          headers: [{ key: "Content-Type", value: tipo }],
        }));
      },
    };

export default nextConfig;
