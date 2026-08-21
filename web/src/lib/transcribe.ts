/**
 * Calling the transcription tool. See ADR-003.
 *
 * The reference clip's transcript is required by Qwen3PromptMaker and produced
 * by a deterministic Python script rather than an ASR node inside ComfyUI. This
 * module is the only place that knows how to reach that script.
 *
 * Server-only: it spawns a process. Importing it from a client component is a
 * build error, which is the intended guard rail.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// The trim bound is imported, never redeclared: the graph is what imposes it,
// and two copies of the number is exactly how the contract in ADR-003 would
// come apart.
import { REF_AUDIO_MAX_SECONDS } from "./voices.ts";

export { REF_AUDIO_MAX_SECONDS };

/** Default ceiling. The first call on a fresh machine also downloads the model. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export type Transcription = {
  text: string;
  language: string;
  model: string;
  decodedSeconds: number;
  /** What the transcript actually covers — assert this against the graph's bound. */
  transcribedSeconds: number;
  elapsedSeconds: number;
};

/**
 * The project root, from wherever Next happens to be running.
 *
 * `process.cwd()` is `web/` under `next dev` but the repo root under some
 * runners, so neither is assumed: walk up until the venv is found.
 */
function projectRoot(): string {
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
function pythonPath(root: string): string {
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

/**
 * Transcribe an audio file that is already on disk.
 *
 * Rejects with a message meant to be shown to the user — the caller turns it
 * into an HTTP response without rewording it.
 */
export async function transcribeFile(
  audioPath: string,
  { maxSeconds = REF_AUDIO_MAX_SECONDS, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
): Promise<Transcription> {
  const root = projectRoot();
  const python = pythonPath(root);
  const script = path.join(root, "execution", "transcribe_audio.py");

  if (!existsSync(script)) throw new Error(`No encuentro el script: ${script}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [script, audioPath, "--max-seconds", String(maxSeconds)],
      { cwd: root, windowsHide: true },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`La transcripción superó ${Math.round(timeoutMs / 1000)}s y se canceló.`));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    child.stdout.on("data", (chunk) => (stdout += chunk));
    // The script keeps stderr for diagnostics (model loading, trim notices) so
    // stdout stays parseable. Surface it only when something actually failed.
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (cause) =>
      finish(() => reject(new Error(`No se pudo ejecutar Python: ${cause.message}`))),
    );

    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          const detail = stderr.trim().split("\n").at(-1) ?? `código ${code}`;
          reject(new Error(detail));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve({
            text: parsed.text,
            language: parsed.language,
            model: parsed.model,
            decodedSeconds: parsed.decoded_seconds,
            transcribedSeconds: parsed.transcribed_seconds,
            elapsedSeconds: parsed.elapsed_seconds,
          });
        } catch {
          reject(new Error("La transcripción devolvió algo que no es JSON."));
        }
      });
    });
  });
}
