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

// ------------------------------------------------------- salud continua ---

/**
 * How often the heartbeat asks the engine whether it is still there.
 *
 * A local HTTP call costs nothing, so this is set by how long an outage may go
 * unnoticed rather than by cost. Fifteen seconds means the worst case is one
 * generation attempt landing on a dead engine.
 */
const HEARTBEAT_MS = 15_000;

/**
 * How many times the heartbeat will bring ComfyUI back before it gives up.
 *
 * ⚠️ THE CAP IS THE POINT, NOT A DETAIL. If the engine was killed by memory
 * pressure — the most likely cause on this machine, where image work and voice
 * work share one card — then relaunching it feeds the problem instead of
 * fixing it. Something that restarts forever turns one outage into a loop that
 * degrades the whole machine, and does it silently.
 *
 * Three is enough to survive a one-off crash and few enough that a systemic
 * problem stops being papered over. After the third, the app says so and stays
 * out of the way, which is the honest outcome: the user needs to know the
 * engine keeps dying, not to be shielded from it.
 */
const MAX_REVIVALS = 3;

/**
 * Uptime after which the revival budget is considered spent on old news.
 *
 * Without this, three crashes spread over a week would exhaust the budget and
 * the fourth outage — hours after the machine had been healthy — would go
 * unattended. The cap is meant to catch a CRASH LOOP, and a loop is defined by
 * crashes close together.
 */
const STABLE_RESET_MS = 10 * 60 * 1000;

/**
 * Wait after noticing a death, before trying to bring it back.
 *
 * A process killed for memory has not necessarily finished releasing it, and
 * relaunching into a machine still under pressure is how a single crash
 * becomes two. This is the cheapest possible version of backing off.
 */
const REVIVE_DELAY_MS = 5_000;

function watchComfy() {
  let revivals = 0;
  /** When the current healthy stretch began, or null while the engine is down. */
  let healthySince = Date.now();
  let reviving = false;
  let warnedGaveUp = false;

  const beat = async () => {
    if (reviving) return;

    if (await responds(`${COMFY_URL}/system_stats`, 3000)) {
      if (healthySince === null) healthySince = Date.now();
      // A long healthy stretch means whatever happened before was not a loop —
      // including the case where the user brought the engine back by hand
      // after this watcher gave up.
      if (revivals > 0 && Date.now() - healthySince > STABLE_RESET_MS) {
        revivals = 0;
        warnedGaveUp = false;
      }
      return;
    }

    // Down: the stability clock does not run. Setting it to "now" here would
    // be claiming a healthy stretch had just begun at the moment it ended.
    healthySince = null;

    if (revivals >= MAX_REVIVALS) {
      if (!warnedGaveUp) {
        warnedGaveUp = true;
        warn(`! ComfyUI ha caído ${MAX_REVIVALS} veces seguidas. No lo levanto más.`);
        warn("  Algo lo está matando — lo más probable, falta de memoria de vídeo");
        warn("  compartida con otro trabajo. Míralo tú antes de seguir generando.");
      }
      return;
    }

    reviving = true;
    revivals += 1;
    warn(`! ComfyUI dejó de responder. Levantándolo (intento ${revivals} de ${MAX_REVIVALS})…`);

    try {
      await new Promise((r) => setTimeout(r, REVIVE_DELAY_MS));
      const up = await ensureComfy();
      if (up) healthySince = Date.now();
      else warn("  No pude levantarlo. Lo reintentaré en el siguiente latido.");
      // Note the budget is spent either way: a relaunch that does not come up
      // is exactly as much evidence of a systemic problem as one that does.
    } finally {
      reviving = false;
    }
  };

  const timer = setInterval(() => void beat(), HEARTBEAT_MS);
  // Never hold the process open on the heartbeat's account: when the app exits,
  // this must not be the reason Node stays alive.
  timer.unref?.();
  return timer;
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

  await ensureComfy();
  await clearPort();
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
  watchComfy();

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
