// Copia los binarios WebAssembly de onnxruntime-web a public/ort/ para servirlos localmente
// (así la app no depende de ningún CDN). Se ejecuta en postinstall, predev y prebuild.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "onnxruntime-web", "dist");
const destino = join(raiz, "public", "ort");
const archivos = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

if (!existsSync(origen)) {
  console.warn("[copiar-ort] onnxruntime-web no está instalado; ejecuta npm install.");
  process.exit(0);
}
mkdirSync(destino, { recursive: true });
for (const a of archivos) copyFileSync(join(origen, a), join(destino, a));
console.log(`[copiar-ort] ${archivos.length} archivos copiados a public/ort/`);
