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

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The project root, from wherever Next happens to be running.
 *
 * `process.cwd()` is `web/` under `next dev` but the repo root under some
 * runners, so neither is assumed: walk up until the manifest is found.
 */
export function projectRoot(): string {
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
      "El entorno de Python del proyecto no existe. Ejecuta `uv sync` en la raíz.",
    );
  }
  return found;
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
  }: {
    timeoutMs?: number;
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
  const python = pythonPath(root);
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
  options?: { timeoutMs?: number; input?: string },
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
