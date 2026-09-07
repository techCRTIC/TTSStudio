/**
 * The half of the launcher that is not the CLI: finding ComfyUI, keeping it
 * alive, and clearing a port that a previous run left held.
 *
 * WHY THIS FILE EXISTS (ADR-009 D3). The desktop build needs exactly these
 * behaviours, and copying them into an Electron main process would have
 * produced two launchers — which is to say one launcher and one copy that is
 * wrong in a different way each month. `npm start` and the packaged app are
 * both thin callers of this.
 *
 * WHAT STAYED IN THE CLI, and why the split falls here: building with Next's
 * CLI and opening a browser are things the desktop build does not do. It ships
 * already built and owns its own window.
 *
 * NOTHING HERE EXITS THE PROCESS. The CLI can die on a held port; a windowed
 * app must show a dialog instead. So the failures throw, and the caller decides
 * what that means.
 *
 * No dependencies: Node's standard library only, so `npm start` works on a
 * clean checkout with nothing installed at the root.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const isWindows = process.platform === "win32";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the port is held by something that is not us. */
export class PuertoOcupadoError extends Error {
  constructor(port, pid) {
    super(
      `El puerto ${port} está ocupado por el proceso ${pid}, y no es TTS Studio.`,
    );
    this.name = "PuertoOcupadoError";
    this.port = port;
    this.pid = pid;
  }
}

export async function responds(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll until `check` passes or the budget runs out. */
export async function waitFor(check, { budgetMs, everyMs = 1000, onTick }) {
  const deadline = Date.now() + budgetMs;
  let ticks = 0;
  while (Date.now() < deadline) {
    if (await check()) return true;
    onTick?.(++ticks);
    await sleep(everyMs);
  }
  return false;
}

export function resolveComfyBin() {
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

export function pidOnPort(port) {
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

/** Kill a process and everything it started. */
export function matarArbol(pid) {
  if (!pid) return;
  if (isWindows) spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore" });
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ya estaba muerto */
    }
  }
}

const nada = () => {};

/**
 * The launcher's engine half, bound to one set of URLs.
 *
 * `registro` takes `{ log, warn, ok }`; anything missing is silently dropped,
 * which is what a windowed app wants — it has no console to write to.
 */
export function crearMotor({
  comfyUrl = process.env.COMFY_URL ?? "http://127.0.0.1:8188",
  appUrl,
  port,
  registro = {},
} = {}) {
  const log = registro.log ?? nada;
  const warn = registro.warn ?? nada;
  const ok = registro.ok ?? nada;

  async function ensureComfy() {
    if (await responds(`${comfyUrl}/system_stats`)) {
      ok(`✓ ComfyUI ya está corriendo en ${comfyUrl}`);
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
    const up = await waitFor(() => responds(`${comfyUrl}/system_stats`), {
      budgetMs: 120_000,
      everyMs: 2000,
      onTick: (n) => n % 5 === 0 && log(`  …esperando a ComfyUI (${n * 2}s)`),
    });

    if (up) ok(`✓ ComfyUI arriba en ${comfyUrl}`);
    else warn("! ComfyUI no respondió en 2 minutos. Sigo igual; la app lo avisará.");
    return up;
  }

  /**
   * A stale server from a previous run is the failure this project hits most,
   * and it is worse than an error: the old build keeps answering, so you debug
   * a page that is not the one you just wrote.
   *
   * It is only safe to kill automatically when the thing on the port is THIS
   * app, so that is what gets checked. Anything else THROWS, and the caller
   * decides — a terminal can die, a window has to say something.
   *
   * ⚠️ DECLARED BLIND SPOT (ADR-009 D4): the title test identifies "a TTS
   * Studio", not "MY TTS Studio". With one copy on a machine those are the same
   * sentence. With two installed copies they are not, and the packaged build
   * must never kill a process it did not start.
   */
  async function clearPort({ matarAjeno = false } = {}) {
    const pid = pidOnPort(port);
    if (!pid) return;

    let mine = false;
    try {
      const res = await fetch(appUrl, { signal: AbortSignal.timeout(2500) });
      mine = (await res.text()).includes("<title>TTS Studio</title>");
    } catch {
      mine = false;
    }

    if (!mine && !matarAjeno) throw new PuertoOcupadoError(port, pid);

    log(`· Había un TTS Studio anterior en el puerto ${port} (pid ${pid}). Lo cierro.`);
    matarArbol(pid);

    const freed = await waitFor(async () => pidOnPort(port) === null, {
      budgetMs: 10_000,
      everyMs: 300,
    });
    if (!freed) throw new Error(`No pude liberar el puerto ${port}.`);
  }

  /** How often the heartbeat asks the engine whether it is still there. */
  const HEARTBEAT_MS = 15_000;
  /** Revive at most this many times before giving up and saying so. */
  const MAX_REVIVALS = 3;
  /** A healthy stretch this long means the crashes were not a loop. */
  const STABLE_RESET_MS = 10 * 60 * 1000;
  /** A process the system just killed has not finished letting go of memory. */
  const REVIVE_DELAY_MS = 5_000;

  function watchComfy() {
    let revivals = 0;
    /** When the current healthy stretch began, or null while the engine is down. */
    let healthySince = Date.now();
    let reviving = false;
    let warnedGaveUp = false;

    const beat = async () => {
      if (reviving) return;

      if (await responds(`${comfyUrl}/system_stats`, 3000)) {
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
        await sleep(REVIVE_DELAY_MS);
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
    // Never hold the process open on the heartbeat's account: when the app
    // exits, this must not be the reason Node stays alive.
    timer.unref?.();
    return timer;
  }

  return { ensureComfy, clearPort, watchComfy, comfyUrl, port, appUrl };
}
