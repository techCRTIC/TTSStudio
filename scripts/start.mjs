#!/usr/bin/env node
/**
 * One command to run TTS Studio.
 *
 * It does, in order, what used to be three manual steps and a browser tab:
 *   1. make sure ComfyUI is up (launching it if it is not, and waiting)
 *   2. clear a stale server left holding the port — but only if it is OURS
 *   3. build and start the app
 *   4. open the browser once the app actually answers
 *
 * WHAT MOVED OUT, AND WHY (ADR-009 D3): steps 1 and 2, plus the engine
 * heartbeat, now live in `./engine.mjs`, because the packaged desktop build
 * needs exactly those and a copy would have become a second launcher that
 * drifts. What stays here is what only a terminal does: build with Next's CLI,
 * open a browser, and die loudly.
 *
 * No dependencies: everything here is Node's standard library, so `npm start`
 * works on a clean checkout without an install at the root.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crearMotor, matarArbol, PuertoOcupadoError, responds, waitFor } from "./engine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");

const PORT = Number(process.env.PORT ?? 3000);
const APP_URL = `http://localhost:${PORT}`;

const isWindows = process.platform === "win32";

const log = (msg) => console.log(msg);
const warn = (msg) => console.log(`\x1b[33m${msg}\x1b[0m`);
const ok = (msg) => console.log(`\x1b[32m${msg}\x1b[0m`);
const die = (msg) => {
  console.error(`\x1b[31m${msg}\x1b[0m`);
  process.exit(1);
};

const motor = crearMotor({
  appUrl: APP_URL,
  port: PORT,
  registro: { log, warn, ok },
});

// --------------------------------------------------------------------- app ---

/**
 * Call Next's own CLI through node rather than going via npm.
 *
 * On Windows npm is `npm.cmd`, and since the CVE-2024-27980 mitigation Node
 * refuses to spawn a `.cmd` at all without `shell: true` — which in turn
 * concatenates arguments instead of escaping them and prints DEP0190 on every
 * run. Running the JS entrypoint directly sidesteps both.
 */
const NEXT_BIN = path.join(WEB, "node_modules", "next", "dist", "bin", "next");

function buildApp() {
  log("· Compilando…");
  const res = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: WEB, stdio: "inherit" });
  if (res.status !== 0) die("✗ La compilación falló.");
}

function openBrowser(url) {
  if (isWindows) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

/**
 * Development mode skips the build and runs Next's dev server instead.
 *
 * It exists because `npm run dev` USED TO BYPASS THIS FILE ENTIRELY — it was
 * `npm run dev --prefix web`, so it never checked the engine, never cleared a
 * stale port, and never watched anything. Someone working in dev mode got a
 * 502 from a dead engine with no warning at all, which is exactly how the
 * 2026-08-25 outage went unnoticed for fifty minutes.
 */
const DEV = process.argv.includes("--dev");

async function main() {
  log("");
  log(`\x1b[1mTTS Studio\x1b[0m${DEV ? " \x1b[2m(desarrollo)\x1b[0m" : ""}`);
  log("");

  await motor.ensureComfy();

  // The engine half throws instead of exiting, because a window cannot die on
  // a held port. A terminal can, so here that is what it does.
  try {
    await motor.clearPort();
  } catch (err) {
    if (err instanceof PuertoOcupadoError) {
      die(
        `✗ ${err.message}\n` +
          `  No lo voy a matar. Ciérralo tú, o corre con otro puerto:  PORT=3001 npm start`,
      );
    }
    die(`✗ ${err?.message ?? err}`);
  }

  if (!DEV) buildApp();

  log(`· Arrancando en ${APP_URL}…`);
  const server = spawn(
    process.execPath,
    DEV
      ? [NEXT_BIN, "dev", "--port", String(PORT)]
      : [NEXT_BIN, "start", "--port", String(PORT)],
    { cwd: WEB, stdio: "inherit" },
  );

  // From here on the engine is watched, not assumed. Started AFTER the server
  // so a slow cold boot never competes with the app's own startup.
  motor.watchComfy();

  // Ctrl+C must take the server with it. Leaving an orphan holding the port is
  // exactly the mess clearPort() exists to clean up.
  const shutdown = () => {
    if (server.pid && isWindows) matarArbol(server.pid);
    else server.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => process.exit(code ?? 0));

  const ready = await waitFor(() => responds(`${APP_URL}/api/voices`, 1500), {
    budgetMs: 60_000,
    everyMs: 500,
  });

  if (!ready) {
    warn(`! La app no respondió a tiempo. Míralo tú en ${APP_URL}`);
    return;
  }

  ok(`✓ Listo — ${APP_URL}`);
  log("  Abriendo el navegador. Ctrl+C para cerrar.");
  log("");
  openBrowser(APP_URL);
}

main().catch((err) => die(`✗ ${err?.message ?? err}`));
