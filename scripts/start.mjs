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
 * No dependencies: everything here is Node's standard library, so `npm start`
 * works on a clean checkout without an install at the root.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");

const PORT = Number(process.env.PORT ?? 3000);
const APP_URL = `http://localhost:${PORT}`;
const COMFY_URL = process.env.COMFY_URL ?? "http://127.0.0.1:8188";

const isWindows = process.platform === "win32";

/** Candidate locations for the comfy CLI, best first. */
function resolveComfyBin() {
  if (process.env.COMFY_BIN) return process.env.COMFY_BIN;

  const onPath = spawnSync(isWindows ? "where" : "which", ["comfy"], { encoding: "utf8" });
  if (onPath.status === 0) {
    const first = onPath.stdout.split(/\r?\n/).find(Boolean);
    if (first) return first.trim();
  }

  // comfy-cli is commonly installed in a dedicated venv that never made it onto
  // PATH — that is the case on this machine, and the reason this fallback exists.
  const venv = path.join(homedir(), "comfy-mcp-venv", "Scripts", isWindows ? "comfy.exe" : "comfy");
  return existsSync(venv) ? venv : null;
}

const log = (msg) => console.log(msg);
const warn = (msg) => console.log(`\x1b[33m${msg}\x1b[0m`);
const ok = (msg) => console.log(`\x1b[32m${msg}\x1b[0m`);
const die = (msg) => {
  console.error(`\x1b[31m${msg}\x1b[0m`);
  process.exit(1);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function responds(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll until `check` passes or the budget runs out. */
async function waitFor(check, { budgetMs, everyMs = 1000, onTick }) {
  const deadline = Date.now() + budgetMs;
  let ticks = 0;
  while (Date.now() < deadline) {
    if (await check()) return true;
    onTick?.(++ticks);
    await sleep(everyMs);
  }
  return false;
}

// ---------------------------------------------------------------- ComfyUI ---

async function ensureComfy() {
  if (await responds(`${COMFY_URL}/system_stats`)) {
    ok(`✓ ComfyUI ya está corriendo en ${COMFY_URL}`);
    return true;
  }

  const bin = resolveComfyBin();
  if (!bin) {
    warn("! ComfyUI no responde y no encuentro el ejecutable `comfy`.");
    warn("  Levántalo a mano, o define COMFY_BIN con su ruta.");
    warn("  La app abrirá igual, pero no podrá generar.");
    return false;
  }

  log(`· ComfyUI no responde. Levantándolo con ${bin}…`);
  const child = spawn(bin, ["launch", "--background"], {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.unref();

  // A cold ComfyUI start loads custom nodes and can genuinely take a minute.
  const up = await waitFor(() => responds(`${COMFY_URL}/system_stats`), {
    budgetMs: 120_000,
    everyMs: 2000,
    onTick: (n) => n % 5 === 0 && log(`  …esperando a ComfyUI (${n * 2}s)`),
  });

  if (up) ok(`✓ ComfyUI arriba en ${COMFY_URL}`);
  else warn("! ComfyUI no respondió en 2 minutos. Sigo igual; la app lo avisará.");
  return up;
}

// -------------------------------------------------------------------- port ---

function pidOnPort(port) {
  if (!isWindows) {
    const out = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return out.stdout.trim().split(/\s+/).filter(Boolean)[0] ?? null;
  }
  const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  for (const line of out.stdout.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] ?? "";
    if (local.endsWith(`:${port}`)) return cols[cols.length - 1];
  }
  return null;
}

/**
 * A stale server from a previous run is the failure this project hits most, and
 * it is worse than an error: the old build keeps answering, so you debug a page
 * that is not the one you just wrote.
 *
 * It is only safe to kill automatically when the thing on the port is THIS app,
 * so that is what gets checked. Anything else is reported, never killed.
 */
async function clearPort() {
  const pid = pidOnPort(PORT);
  if (!pid) return;

  let mine = false;
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(2500) });
    mine = (await res.text()).includes("<title>TTS Studio</title>");
  } catch {
    mine = false;
  }

  if (!mine) {
    die(
      `✗ El puerto ${PORT} está ocupado por el proceso ${pid}, y no es TTS Studio.\n` +
        `  No lo voy a matar. Ciérralo tú, o corre con otro puerto:  PORT=3001 npm start`,
    );
  }

  log(`· Había un TTS Studio anterior en el puerto ${PORT} (pid ${pid}). Lo cierro.`);
  spawnSync(isWindows ? "taskkill" : "kill", isWindows ? ["/PID", pid, "/F", "/T"] : ["-9", pid], {
    stdio: "ignore",
  });

  const freed = await waitFor(async () => pidOnPort(PORT) === null, { budgetMs: 10_000, everyMs: 300 });
  if (!freed) die(`✗ No pude liberar el puerto ${PORT}.`);
}

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
  if (res.error) die(`✗ No pude ejecutar Next: ${res.error.message}`);
  if (res.status !== 0) die(`✗ La compilación falló (código ${res.status}). Nada que arrancar.`);
  ok("✓ Compilado");
}

function openBrowser(url) {
  if (isWindows) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  log("");
  log("\x1b[1mTTS Studio\x1b[0m");
  log("");

  await ensureComfy();
  await clearPort();
  buildApp();

  log(`· Arrancando en ${APP_URL}…`);
  const server = spawn(process.execPath, [NEXT_BIN, "start", "--port", String(PORT)], {
    cwd: WEB,
    stdio: "inherit",
  });

  // Ctrl+C must take the server with it. Leaving an orphan holding the port is
  // exactly the mess clearPort() exists to clean up.
  const shutdown = () => {
    if (server.pid && isWindows) spawnSync("taskkill", ["/PID", String(server.pid), "/F", "/T"], { stdio: "ignore" });
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
