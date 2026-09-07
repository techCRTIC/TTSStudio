import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /**
   * `standalone` produce un servidor que se puede copiar y arrancar solo, con
   * sus dependencias ya recortadas dentro.
   *
   * Hace falta porque esta app NO puede ser estática: sus rutas de `api/`
   * lanzan Python, leen el disco y hacen de puente hacia ComfyUI quitando la
   * cabecera `Origin` (ADR-001). Empaquetarla es, por fuerza, empaquetar un
   * servidor — y esa es la razón por la que Tauri dejó de tener ventaja frente
   * a Electron (ADR-009 D1).
   */
  output: "standalone",

  /**
   * La raíz de trazado se FIJA, y no es cosmético.
   *
   * Next la infiere buscando lockfiles hacia arriba, así que la forma de lo que
   * produce cambia según qué haya fuera de esta carpeta. Se descubrió del peor
   * modo: instalar Electron en la raíz del repositorio creó un
   * `package-lock.json` ahí, Next cambió de opinión sobre dónde estaba la raíz,
   * y el servidor pasó de `standalone/server.js` a `standalone/web/server.js`
   * — con lo que el empaquetado dejó de encontrarlo.
   *
   * Fijada aquí, la salida es la misma con o sin lockfiles alrededor.
   */
  outputFileTracingRoot: AQUI,
};

export default nextConfig;
