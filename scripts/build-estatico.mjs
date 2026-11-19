// Genera el sitio estático en out/ (EXPORTAR_ESTATICO=1, ver next.config.ts).
// El resultado se puede publicar en cualquier hosting de archivos: no necesita Node ni el backend.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPORTAR_ESTATICO: "1" },
});
process.exit(r.status ?? 1);
