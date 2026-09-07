#!/usr/bin/env node
/**
 * Assemble what the desktop build ships, and nothing else (ADR-009 D2).
 *
 * The layout it produces, which `desktop/main.mjs` depends on:
 *
 *   desktop/build/app/
 *     server/            the Next standalone server, ready to run
 *       server.js
 *       .next/static/    ← copied by hand; Next does NOT put it here
 *       public/
 *     execution/         the deterministic Python scripts
 *     pyproject.toml     so the venv the portal creates is regenerable
 *
 * WHY `.next/static` IS COPIED EXPLICITLY: `output: "standalone"` deliberately
 * leaves it out, because most deployments serve it from a CDN. Package without
 * it and the app starts, answers, and renders with no styles and no client
 * JavaScript — which looks like a broken app rather than a missing folder. It
 * is the classic way to ship a broken Next build.
 *
 * WHAT IS DELIBERATELY NOT SHIPPED: ComfyUI, Python, the models. The portal
 * installs those on first run (ADR-008). Also pruned: `src` and `tests`, which
 * Next's tracer copies into the standalone folder and which have no business
 * inside a distributed binary.
 *
 * Standard library only, like the rest of `scripts/`.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const STANDALONE = path.join(WEB, ".next", "standalone");
const STATIC = path.join(WEB, ".next", "static");
const DESTINO = path.join(ROOT, "desktop", "build", "app");
const SERVIDOR = path.join(DESTINO, "server");

const log = (m) => console.log(m);
const die = (m) => {
  console.error(`\x1b[31m${m}\x1b[0m`);
  process.exit(1);
};

function mb(dir) {
  let total = 0;
  const andar = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) andar(p);
      else total += s.size;
    }
  };
  andar(dir);
  return Math.round(total / (1024 * 1024));
}

if (!existsSync(STANDALONE)) {
  die(
    "✗ No hay build autónomo.\n" +
      "  Corre primero:  npm run build\n" +
      "  (necesita `output: \"standalone\"` en web/next.config.ts)",
  );
}
if (!existsSync(STATIC)) {
  die("✗ Falta web/.next/static. La compilación quedó a medias.");
}

log("· Limpiando lo de la vez anterior…");
rmSync(path.join(ROOT, "desktop", "build"), { recursive: true, force: true });
mkdirSync(SERVIDOR, { recursive: true });

/**
 * Dónde está `server.js` dentro del autónomo — BUSCADO, no supuesto.
 *
 * Next decide la forma de esta carpeta según dónde crea que está la raíz del
 * proyecto, y lo decide mirando lockfiles hacia arriba. Instalar algo en la
 * raíz del repositorio movió el servidor de `standalone/server.js` a
 * `standalone/web/server.js` sin que nada cambiara aquí dentro.
 *
 * `next.config.ts` ya fija esa raíz para que no vuelva a pasar. Esto es el
 * cinturón además de los tirantes: si alguien quita ese ajuste, el empaquetado
 * sigue funcionando en vez de romperse de una forma que cuesta media hora
 * entender.
 */
function buscarServidor(dir, profundidad = 0) {
  if (existsSync(path.join(dir, "server.js"))) return dir;
  if (profundidad >= 2) return null;
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules") continue;
    const hijo = path.join(dir, entrada);
    if (!statSync(hijo).isDirectory()) continue;
    const hallado = buscarServidor(hijo, profundidad + 1);
    if (hallado) return hallado;
  }
  return null;
}

const ORIGEN_SERVIDOR = buscarServidor(STANDALONE);
if (!ORIGEN_SERVIDOR) die(`✗ No encuentro server.js dentro de ${STANDALONE}.`);

log("· Copiando el servidor autónomo…");
cpSync(ORIGEN_SERVIDOR, SERVIDOR, { recursive: true });
// Las dependencias viven en la RAÍZ del autónomo cuando la salida va anidada,
// así que se traen aparte si no vinieron con el servidor.
const NM = path.join(STANDALONE, "node_modules");
if (existsSync(NM) && !existsSync(path.join(SERVIDOR, "node_modules"))) {
  cpSync(NM, path.join(SERVIDOR, "node_modules"), { recursive: true });
}

log("· Copiando .next/static (Next no lo hace, y sin esto la app sale sin estilos)…");
cpSync(STATIC, path.join(SERVIDOR, ".next", "static"), { recursive: true });

log("· Quitando lo que no debe viajar en un binario…");
for (const sobra of ["src", "tests", "tsconfig.tsbuildinfo", "eslint.config.mjs", "AGENTS.md", "CLAUDE.md"]) {
  rmSync(path.join(SERVIDOR, sobra), { recursive: true, force: true });
}

log("· Copiando los scripts de execution/…");
cpSync(path.join(ROOT, "execution"), path.join(DESTINO, "execution"), {
  recursive: true,
  filter: (src) => !src.includes("__pycache__") && !src.endsWith(".pyc"),
});

log("· Copiando pyproject.toml (el entorno tiene que ser regenerable)…");
cpSync(path.join(ROOT, "pyproject.toml"), path.join(DESTINO, "pyproject.toml"));

// La comprobación que convierte «copié cosas» en «esto puede arrancar».
const imprescindibles = [
  path.join(SERVIDOR, "server.js"),
  path.join(SERVIDOR, ".next", "static"),
  path.join(DESTINO, "execution", "auditar_host.py"),
  path.join(DESTINO, "execution", "manifiesto.json"),
  path.join(DESTINO, "pyproject.toml"),
];
const faltan = imprescindibles.filter((p) => !existsSync(p));
if (faltan.length > 0) {
  die(`✗ El paquete quedó incompleto:\n${faltan.map((p) => `    ${p}`).join("\n")}`);
}

log("");
log(`\x1b[32m✓ Listo en desktop/build/app — ${mb(DESTINO)} MB\x1b[0m`);
log("  Eso es SOLO la app. ComfyUI, Python y los modelos los instala el portal.");
