/**
 * Building and submitting the Qwen3-TTS voice-clone graph.
 *
 * The app uses the CACHED graph (Qwen3LoadPrompt): the voice is a prompt file
 * already computed on disk, so a generation only varies text and seed. The
 * uncached path recomputes the voice embedding from a reference wav on every
 * call, which is waste once the voice exists.
 */

import { comfyFetch, comfyUrl } from "./comfy.ts";

export type Voice = { id: string; label: string };

export type GenerationStatus =
  | { state: "queued"; position: number | null }
  | { state: "running" }
  | { state: "done"; audioUrl: string; filename: string }
  /**
   * Finished successfully, but produced no audio — which is the NORMAL outcome
   * for a graph whose job is to write a file. Voice registration ends in
   * Qwen3SavePrompt, an OUTPUT_NODE that saves a .safetensors and reports
   * `outputs: {}`.
   *
   * Without this state, such a job reads as "queued" forever: the history
   * entry exists and is successful, but the audio lookup finds nothing and the
   * queue no longer lists it. Measured against the real engine on 2026-08-21.
   */
  | { state: "finished" }
  | { state: "failed"; message: string };

/** Turn "andres_bobe.safetensors" into "Andres Bobe". */
function labelFor(file: string): string {
  return file
    .replace(/\.safetensors$/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The voice library is not a database we keep — it is whatever ComfyUI reports
 * in the Qwen3LoadPrompt combo, which it populates from
 * models/Qwen3-TTS/prompts/. One source of truth, and it cannot drift.
 */
export async function listVoices(): Promise<Voice[]> {
  const res = await comfyFetch(comfyUrl(["object_info", "Qwen3LoadPrompt"]));
  if (!res.ok) throw new Error(`object_info devolvió ${res.status}`);
  const info = await res.json();
  const combo = info?.Qwen3LoadPrompt?.input?.required?.prompt_file?.[0];
  if (!Array.isArray(combo)) return [];
  return combo.map((id: string) => ({ id, label: labelFor(id) }));
}

/**
 * Everything Qwen3VoiceClone actually exposes, and nothing more.
 *
 * Read off the node's own INPUT_TYPES (nodes.py:702-719), not from memory:
 * `seed`, `language` and `max_new_tokens` are the only knobs on the cached
 * path. There is no temperature, no speed, no emotion and no pitch — the
 * product rule is that the interface never offers a control the engine lacks.
 */
export const SEED_MIN = 1;
/**
 * The node accepts up to 2^64-1, which JavaScript cannot represent exactly as
 * a number. Random seeds are drawn below 2^31 so every value we generate,
 * store and round-trip through JSON is exact.
 */
export const SEED_MAX_SAFE = 2 ** 31 - 1;

export const TOKENS_MIN = 64;
export const TOKENS_MAX = 8192;
export const TOKENS_STEP = 64;

/**
 * How many audio tokens the engine spends per second of speech. MEASURED.
 *
 * `execution/benchmark_token_rate.py`, 2026-08-21, against this machine's
 * engine and the andres_bobe voice. Four ceilings that genuinely constrained
 * the generation:
 *
 *     128 -> 10.16 s   192 -> 15.28 s   256 -> 20.40 s   320 -> 25.52 s
 *     12.598           12.565           12.549           12.539
 *
 * Mean 12.563, spread 0.5%. The model's name (Qwen3-TTS-**12Hz**) suggested 12,
 * close enough to be tempting and wrong enough to matter — a name is a hint,
 * and this project does not ship hints as facts.
 *
 * ⚠️ Only a ceiling that actually binds measures anything. The first attempt
 * included a ceiling of 512, which returned the same duration as a ceiling of
 * 8192 because the text had finished first — averaging it in inflated the rate
 * to 13.50. The benchmark now runs an unconstrained control first and discards
 * such samples out loud.
 */
export const TOKENS_PER_SECOND = 12.56;

export function tokensToSeconds(tokens: number): number {
  return tokens / TOKENS_PER_SECOND;
}

/**
 * The length ceiling, offered in the unit a person actually thinks in.
 *
 * Token counts are what the engine wants and "4096" is what nobody wants to
 * reason about. Each preset is the measured rate turned back into tokens and
 * snapped to the node's step of 64, so the labels are honest to within a second
 * or two rather than being round numbers with a plausible caption.
 *
 * ⚠️ A ceiling never LENGTHENS anything. It is the point at which the engine
 * stops, not a duration to fill: a short text produces short audio no matter
 * what is chosen here. The only thing a bigger ceiling buys is not being cut
 * off — and the only thing it costs is nothing at all, which is why the
 * highest value is not the default: a runaway generation stops sooner.
 */
export const TOKEN_PRESETS = [
  { tokens: 384, label: "Hasta 30 segundos" },
  { tokens: 768, label: "Hasta 1 minuto" },
  { tokens: 1536, label: "Hasta 2 minutos" },
  { tokens: 3776, label: "Hasta 5 minutos" },
  { tokens: TOKENS_MAX, label: "Todo lo que da el motor (11 min)" },
] as const;

export const TOKENS_DEFAULT = 3776;

/**
 * The length, in characters, past which the client segments a script instead
 * of sending it as one generation. Fase 3 (guiones largos).
 *
 * ⚠️ This number is duplicated on purpose in `execution/tts_trocear_guion.py`
 * as `MAX_CHARS`, and `execution/check_segment_contract.py` reads both sides
 * by regex and fails the build if they disagree — the same seam pattern as
 * `execution/check_trim_contract.py`.
 *
 * It cannot live in one place instead, because the two places decide
 * different things. The Python side decides how a script actually gets cut —
 * on full sentences, remembering paragraph breaks. This constant decides
 * something earlier and cheaper: whether a script needs cutting AT ALL, and
 * that has to be answered by counting characters right here, never by asking
 * the trocheador. Spawning Python just to learn "how many segments would this
 * be" would itself be the extra process the product rule forbids — a script
 * that comes out as ONE segment must cost exactly what a single generation
 * costs today, not one Python process more.
 */
export const SEGMENT_MAX_CHARS = 600;

/** The node's own list, in its own order, with Auto first. */
export const LANGUAGES = [
  "Auto",
  "Spanish",
  "English",
  "Portuguese",
  "Italian",
  "French",
  "German",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * Absent, or not a number at all.
 *
 * `Number(null)`, `Number("")` and `Number([])` are all 0, not NaN — so a
 * plain `Number()` turns "nothing was sent" into "the number zero" and the
 * clamp below happily accepts it. Missing has to be recognised BEFORE the
 * coercion, or an omitted ceiling silently becomes the minimum one.
 */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === "" || typeof value === "object";
}

/** A seed the engine will accept: whole, in range, never zero. */
export function normalizeSeed(value: unknown): number {
  if (isAbsent(value)) return randomSeed();
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return randomSeed();
  return Math.min(SEED_MAX_SAFE, Math.max(SEED_MIN, n));
}

/** Snap to the node's step and clamp, so ComfyUI never rejects the graph. */
export function normalizeTokens(value: unknown): number {
  if (isAbsent(value)) return TOKENS_DEFAULT;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return TOKENS_DEFAULT;
  const snapped = Math.round(n / TOKENS_STEP) * TOKENS_STEP;
  return Math.min(TOKENS_MAX, Math.max(TOKENS_MIN, snapped));
}

export function randomSeed(): number {
  // SEED_MIN is 1, and the node rejects 0 — so the floor is added, never risked.
  return SEED_MIN + Math.floor(Math.random() * (SEED_MAX_SAFE - SEED_MIN));
}

export type GenerationOptions = {
  language?: Language;
  maxNewTokens?: number;
};

export function buildWorkflow(
  text: string,
  voiceId: string,
  seed: number,
  options: GenerationOptions = {},
) {
  return {
    "1": {
      class_type: "Qwen3Loader",
      inputs: {
        repo_id: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        source: "HuggingFace",
        precision: "bf16",
        attention: "sdpa",
      },
    },
    "2": {
      class_type: "Qwen3LoadPrompt",
      inputs: { prompt_file: voiceId },
    },
    "3": {
      class_type: "Qwen3VoiceClone",
      inputs: {
        model: ["1", 0],
        prompt: ["2", 0],
        text,
        seed: normalizeSeed(seed),
        // Spanish stays the default rather than "Auto": this user writes in
        // Spanish, and letting the model guess on a short line is a coin flip
        // nobody asked for.
        language: options.language ?? "Spanish",
        max_new_tokens: normalizeTokens(options.maxNewTokens ?? TOKENS_DEFAULT),
      },
    },
    "4": {
      class_type: "SaveAudio",
      inputs: { audio: ["3", 0], filename_prefix: "ttsstudio" },
    },
  };
}

/** Submit a graph and return ComfyUI's prompt id. */
export async function submit(
  text: string,
  voiceId: string,
  seed: number,
  options: GenerationOptions = {},
): Promise<string> {
  const res = await comfyFetch(comfyUrl(["prompt"]), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify({ prompt: buildWorkflow(text, voiceId, seed, options) }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    // ComfyUI reports graph errors here, and they are worth surfacing verbatim
    // rather than as a generic failure the user cannot act on.
    const detail = payload?.error?.message ?? payload?.error ?? `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return payload.prompt_id as string;
}

/**
 * Where a generation stands, read from the engine — never guessed.
 * History first (a finished job leaves history even if the queue moved on).
 */
export async function statusOf(promptId: string): Promise<GenerationStatus> {
  const histRes = await comfyFetch(comfyUrl(["history", promptId]));
  if (histRes.ok) {
    const hist = await histRes.json();
    const entry = hist?.[promptId];
    if (entry) {
      const status = entry.status ?? {};
      if (status.status_str === "error" || status.completed === false) {
        const msg = findError(status) ?? "La generación falló en ComfyUI.";
        return { state: "failed", message: msg };
      }
      const audio = firstAudio(entry.outputs ?? {});
      if (audio) {
        return {
          state: "done",
          filename: audio.filename,
          audioUrl: `/api/comfy/view?filename=${encodeURIComponent(audio.filename)}&subfolder=${encodeURIComponent(audio.subfolder ?? "")}&type=${encodeURIComponent(audio.type ?? "output")}`,
        };
      }

      // The engine said it succeeded and there is no audio to hand back. That
      // is a completed file-writing graph, not a job still waiting — falling
      // through to the queue lookup below would report it as queued forever.
      if (status.completed === true) return { state: "finished" };
    }
  }

  const queueRes = await comfyFetch(comfyUrl(["queue"]));
  if (queueRes.ok) {
    const q = await queueRes.json();
    const running = (q.queue_running ?? []).some((item: unknown[]) => item[1] === promptId);
    if (running) return { state: "running" };
    const idx = (q.queue_pending ?? []).findIndex((item: unknown[]) => item[1] === promptId);
    if (idx >= 0) return { state: "queued", position: idx + 1 };
  }

  return { state: "queued", position: null };
}

type AudioOut = { filename: string; subfolder?: string; type?: string };

function firstAudio(outputs: Record<string, { audio?: AudioOut[] }>): AudioOut | null {
  for (const node of Object.values(outputs)) {
    if (node.audio?.length) return node.audio[0];
  }
  return null;
}

function findError(status: { messages?: unknown[][] }): string | null {
  for (const [kind, data] of status.messages ?? []) {
    if (kind === "execution_error" && data && typeof data === "object") {
      const d = data as { exception_message?: string; node_type?: string };
      return d.node_type ? `${d.node_type}: ${d.exception_message}` : (d.exception_message ?? null);
    }
  }
  return null;
}
