/**
 * Running this project's deterministic Python scripts (CLAUDE.md, Layer 3).
 *
 * WHY IT IS ITS OWN MODULE
 *   These path rules and the encoding guard below were written once for the
 *   transcription bridge (ADR-003) and were about to be copied for the text
 *   quality tools. Every one of them is a bug that already bit this project
 *   once, and a copy is a place for the fix to be missing next time.
 *
 * Server-only: it spawns a process. Importing it from a client component is a
 * build error, which is the intended guard rail.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The project root, from wherever Next happens to be running.
 *
 * `process.cwd()` is `web/` under `next dev` but the repo root under some
 * runners, so neither is assumed: walk up until the manifest is found.
 */
export function projectRoot(): string {
  // Empaquetado, la raíz NO se adivina (ADR-009 D6.1). Electron la fija, porque
  // deducirla subiendo desde un directorio de instalación es una conjetura que
  // en la máquina de alguien va a salir mal. En desarrollo se sigue buscando.
  const declarada = process.env.TTS_PROJECT_ROOT;
  if (declarada && existsSync(path.join(declarada, "execution"))) return declarada;

  let dir = process.cwd();
  for (let i = 0; i < 4; i += 1) {
    if (existsSync(path.join(dir, "pyproject.toml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    "No encuentro la raíz del proyecto (busqué pyproject.toml hacia arriba desde " +
      `${process.cwd()}).`,
  );
}

/**
 * The venv interpreter.
 *
 * Deliberately the real `python.exe`, never `uv.cmd` or any other `.cmd`
 * shim: on Windows, Node refuses to spawn a `.cmd` without a shell, and
 * spawning with a shell warns on every run. Pointing at the executable
 * sidesteps that entirely.
 */
export function pythonPath(root: string): string {
  const candidates =
    process.platform === "win32"
      ? [path.join(root, ".venv", "Scripts", "python.exe")]
      : [path.join(root, ".venv", "bin", "python3"), path.join(root, ".venv", "bin", "python")];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      // ESTE MENSAJE LO LEE UN USUARIO, NO UN PROGRAMADOR. Decía «ejecuta
      // `uv sync` en la raíz», que no significa nada para quien solo quiere
      // clonar una voz — ¿qué raíz? ¿qué es uv? Y aparecía dentro de la app,
      // en la pantalla, como respuesta a subir un audio.
      "Falta un componente que esta función necesita. Se instala desde el " +
        "engranaje de arriba a la derecha, en «Componentes para audio».",
    );
  }
  return found;
}

/**
 * Un intérprete para los scripts que NO necesitan paquetes de terceros.
 *
 * POR QUÉ EXISTE, Y POR QUÉ LA DISTINCIÓN ES LOAD-BEARING (ADR-009 D6.2):
 * en una instalación recién hecha no hay `.venv`, y `pythonPath` lanza. Eso
 * dejaba al portal de configuración sin poder auditar NI instalar justo en la
 * máquina para la que existe — la del usuario nuevo. Pero la mayoría de los
 * scripts de `execution/` son **biblioteca estándar pura** y corren con
 * cualquier Python que haya por ahí.
 *
 * Medido, no supuesto: **solo dos** scripts necesitan paquetes de terceros —
 * `tts_unir_tramos.py` (numpy, soundfile) y `transcribe_audio.py`
 * (faster-whisper). Esos dos siguen exigiendo el entorno con `pythonPath`.
 *
 * Devuelve `null` en vez de lanzar: quien llama tiene que decidir qué contar,
 * y «no hay Python» es una respuesta, no una excepción.
 */
let cacheStdlib: string | null | undefined;

export function stdlibPython(root: string): string | null {
  if (cacheStdlib !== undefined) return cacheStdlib;

  // El del proyecto primero: si existe es el mejor, y evita sorpresas de versión.
  try {
    cacheStdlib = pythonPath(root);
    return cacheStdlib;
  } catch {
    /* no hay venv — se busca uno del sistema */
  }

  const candidatos =
    process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];

  for (const candidato of candidatos) {
    try {
      // Se COMPRUEBA que arranca, no solo que está en el PATH. En Windows,
      // `python` suele ser un señuelo de la Store que existe, no hace nada y
      // abre una tienda: encontrarlo y creerle produce un fallo peor y más
      // tarde que no encontrarlo.
      const prueba = spawnSync(candidato, ["-c", "print(1)"], {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      });
      if (prueba.status === 0 && prueba.stdout.trim() === "1") {
        cacheStdlib = candidato;
        return cacheStdlib;
      }
    } catch {
      /* siguiente */
    }
  }

  cacheStdlib = null;
  return null;
}

/** Solo para los tests: olvida el intérprete descubierto. */
export function olvidarPythonDescubierto(): void {
  cacheStdlib = undefined;
}

export type PythonResult = {
  stdout: string;
  stderr: string;
  code: number;
};

/**
 * Run `execution/<script>` and hand back its streams.
 *
 * ⚠️ It RESOLVES on a non-zero exit rather than rejecting, because in this
 * project a non-zero exit is not always a failure: `tts_revisar_texto.py`
 * exits 1 to mean "the text has blocking problems", which is a successful
 * review with a bad verdict. The caller decides what the code means.
 * A crash — spawn failure, timeout — still rejects.
 */
export function runScript(
  scriptName: string,
  args: string[],
  {
    timeoutMs = 60_000,
    input,
    stdlibOnly = false,
  }: {
    timeoutMs?: number;
    /**
     * Este script es biblioteca estándar pura y puede correr con cualquier
     * Python (ADR-009 D6.2).
     *
     * Se pide EXPLÍCITAMENTE y por defecto es `false`, porque el error en la
     * dirección contraria es el caro: dejar que un script que necesita numpy
     * caiga a un intérprete del sistema no falla al arrancar — falla dentro,
     * con un `ImportError` que no dice que el problema es el entorno.
     */
    stdlibOnly?: boolean;
    /**
     * Text to write to the script's stdin, then close it.
     *
     * WHY THIS EXISTS AND WHEN TO REACH FOR IT: a command-line argument is
     * capped at 32.767 characters on Windows, and a thirty-minute narration is
     * around 27.000 — close enough that the segmenter would start failing on
     * exactly the scripts it exists to handle. A pipe has no such ceiling.
     *
     * It is also the SAFE way to hand a script a body of text: the alternative
     * is writing a temp file and passing its path, which means inventing a
     * second writable location outside `comfy-files.ts` (ADR-004) and cleaning
     * it up afterwards. Nothing to resolve, nothing to delete, no path at all.
     *
     * ⚠️ The receiving script must call `_console.use_utf8()`, which
     * reconfigures stdin as well as stdout. Without it Python decodes this
     * pipe as the console code page and every accent changes character — on
     * the exact text a voice is about to say.
     */
    input?: string;
  } = {},
): Promise<PythonResult> {
  const root = projectRoot();
  const python = stdlibOnly ? stdlibPython(root) : pythonPath(root);
  if (python === null) {
    return Promise.reject(
      new Error(
        "No se encontró ningún Python en esta máquina. Instálalo desde " +
          "python.org y vuelve a abrir la app.",
      ),
    );
  }
  const script = path.join(root, "execution", scriptName);

  if (!existsSync(script)) {
    return Promise.reject(new Error(`No encuentro el script: ${script}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], {
      cwd: root,
      windowsHide: true,
      // Belt and braces on the encoding. The scripts force UTF-8 on their own
      // streams (execution/_console.py), and this makes the interpreter start
      // that way regardless. Without either, Python writes stdout in the
      // console's code page — cp1252 here — and "más" arrives as a byte that is
      // not valid UTF-8, so every accent reaches the browser as U+FFFD. That is
      // not cosmetic: this text is what the voice says.
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    if (input !== undefined) {
      // `end()` is what makes `sys.stdin.read()` return instead of blocking
      // forever, so the write and the close are one step, never two.
      child.stdin.setDefaultEncoding("utf8");
      child.stdin.end(input);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`${scriptName} superó ${Math.round(timeoutMs / 1000)}s y se canceló.`));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    // Stated rather than left to the default. Concatenating Buffers with `+=`
    // decodes each chunk on its own, which splits any multi-byte character that
    // lands on a chunk boundary — an accent turning into a replacement
    // character depending on how the pipe happened to break.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (cause) =>
      finish(() => reject(new Error(`No se pudo ejecutar Python: ${cause.message}`))),
    );

    child.on("close", (code) => finish(() => resolve({ stdout, stderr, code: code ?? 0 })));
  });
}

/** Run a script that prints one JSON object, and parse it. */
export async function runScriptJson<T>(
  scriptName: string,
  args: string[],
  options?: { timeoutMs?: number; input?: string; stdlibOnly?: boolean },
): Promise<{ data: T; code: number }> {
  const { stdout, stderr, code } = await runScript(scriptName, args, options);

  try {
    return { data: JSON.parse(stdout) as T, code };
  } catch {
    // A parse failure with a bad exit code means the script died before
    // printing; report ITS message rather than "not JSON", which would send the
    // caller looking in the wrong place.
    const detail = stderr.trim().split("\n").at(-1);
    throw new Error(
      detail && code !== 0 ? detail : `${scriptName} devolvió algo que no es JSON.`,
    );
  }
}
