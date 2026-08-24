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

// The path rules and the encoding guard live in one place now: each of them is
// a bug that already bit this project once, and a copy is where the fix goes
// missing. See ./python.
import { projectRoot, pythonPath } from "./python.ts";

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
      {
        cwd: root,
        windowsHide: true,
        // Belt and braces on the encoding. The script forces UTF-8 on its own
        // streams (execution/_console.py), and this makes the interpreter start
        // that way regardless. Without either, Python writes stdout in the
        // console's code page — cp1252 here — and "más" arrives as a byte that
        // is not valid UTF-8, so every accent reaches the browser as U+FFFD.
        // That is not cosmetic: the transcript is what the voice embedding is
        // computed against.
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
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

    // Stated rather than left to the default. Concatenating Buffers with `+=`
    // decodes each chunk on its own, which splits any multi-byte character that
    // lands on a chunk boundary — an accent turning into a replacement
    // character depending on how the pipe happened to break. Setting the
    // encoding hands us a properly decoded string instead.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

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
