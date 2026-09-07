/**
 * Registering a new voice. See ADR-003 and roadmap Phase 2.
 *
 * The voice library is not a database this app keeps — it is whatever ComfyUI
 * reports from models/Qwen3-TTS/prompts/ (see `listVoices` in ./tts). So
 * registering a voice means putting one more .safetensors in that directory,
 * and the selector picks it up with no further bookkeeping.
 *
 * The chain, verified against the pack's source (nodes.py:530-620):
 *
 *   upload the clip -> LoadAudio -> Qwen3PromptMaker -> Qwen3SavePrompt
 *                                        ^                    |
 *                                   needs ref_text            v
 *                                                    models/Qwen3-TTS/prompts/
 */

import { comfyFetch, comfyUrl } from "./comfy.ts";

/**
 * How many seconds of the reference clip are used.
 *
 * ⚠️ THIS IS HALF OF A CONTRACT, and it lives here because the graph is what
 * imposes it: Qwen3PromptMaker trims `ref_audio` to `ref_audio_max_seconds`
 * before computing the embedding. Whatever transcribes the clip MUST be given
 * this same number. If they diverge, the transcript describes audio the model
 * never heard and the voice degrades — silently, with everything green.
 * See ADR-003 § The trim contract.
 */
export const REF_AUDIO_MAX_SECONDS = 30;

/** Extensions ComfyUI's LoadAudio will actually list from its input directory. */
const ALLOWED_AUDIO = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a"]);

/**
 * Turn a display name into a safe prompt filename.
 *
 * ⚠️ SECURITY, not cosmetics. Qwen3SavePrompt builds its path with a bare
 * `os.path.join(PROMPTS_DIR, f"{filename}.safetensors")` and sanitizes
 * nothing, so a name containing `..` or a separator writes outside the voice
 * directory. This function is the only thing standing between a user-supplied
 * string and that join: the output is restricted to [a-z0-9_], which cannot
 * express a traversal at all.
 *
 * It is also the inverse of `labelFor` in ./tts, so "Martín Vega" round-trips
 * to "martin_vega" and back.
 */
export function voiceSlug(displayName: string): string {
  const slug = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "Martín" -> "Martin"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) throw new Error("El nombre de la voz no tiene ninguna letra ni número utilizable.");
  if (slug.length > 64) return slug.slice(0, 64).replace(/_+$/, "");
  return slug;
}

/** Reject anything LoadAudio would not list, before it reaches the engine. */
export function assertAudioFilename(filename: string): void {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (!ALLOWED_AUDIO.has(ext)) {
    throw new Error(
      `Formato de audio no admitido (${ext || "sin extensión"}). ` +
        `Usa uno de: ${[...ALLOWED_AUDIO].join(", ")}.`,
    );
  }
}

/**
 * Put the reference clip into ComfyUI's input directory.
 *
 * The endpoint is `/upload/image` and the field is literally named `image`
 * even for audio — ComfyUI does not inspect the type, it writes the bytes
 * (server.py:397-467). It also renames on collision, so the returned `name`
 * is authoritative and must be what the graph loads, not what we sent.
 */
export async function uploadReferenceAudio(file: File): Promise<string> {
  assertAudioFilename(file.name);

  const form = new FormData();
  form.append("image", file, file.name);
  form.append("type", "input");
  form.append("overwrite", "false");

  // Plain fetch rather than comfyFetch on purpose: fetch must be left to set
  // its own multipart content-type with the generated boundary, and no browser
  // headers are forwarded here anyway, so there is no Origin to strip. The URL
  // still goes through comfyUrl so there is one way to address the engine.
  const res = await fetch(comfyUrl(["upload", "image"]), {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`ComfyUI rechazó el audio de referencia (HTTP ${res.status}).`);
  }

  const payload = (await res.json()) as { name?: string; subfolder?: string };
  if (!payload?.name) throw new Error("ComfyUI aceptó el audio pero no dijo con qué nombre.");

  // LoadAudio addresses files in subfolders with "sub/name"; we always upload
  // to the root of input/, but honour the response rather than assuming.
  return payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name;
}

/**
 * The graph that computes a voice embedding and saves it.
 *
 * `maxSeconds` MUST be the same bound the transcript was produced under —
 * see ADR-003 § The trim contract. It is a parameter rather than a constant
 * precisely so the caller has to pass the value it actually used.
 */
export function buildRegistrationWorkflow(
  audioFilename: string,
  refText: string,
  voiceFilename: string,
  maxSeconds: number = REF_AUDIO_MAX_SECONDS,
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
      class_type: "LoadAudio",
      inputs: { audio: audioFilename },
    },
    "3": {
      class_type: "Qwen3PromptMaker",
      inputs: {
        model: ["1", 0],
        ref_audio: ["2", 0],
        ref_text: refText,
        ref_audio_max_seconds: maxSeconds,
      },
    },
    "4": {
      class_type: "Qwen3SavePrompt",
      inputs: {
        prompt: ["3", 0],
        filename: voiceFilename,
      },
    },
  };
}

export type RegistrationInput = {
  /** Name as ComfyUI reported it after upload. */
  audioFilename: string;
  /** The transcript, as the user finally approved it. */
  refText: string;
  /** Display name; slugged before it reaches the engine. */
  displayName: string;
  /** The same bound the transcript was produced under. */
  maxSeconds?: number;
};

/** Submit the registration graph. Returns ComfyUI's prompt id. */
export async function registerVoice(input: RegistrationInput): Promise<string> {
  const refText = input.refText.trim();
  if (!refText) {
    // Qwen3VoiceClone rejects an empty ref_text outright (nodes.py:744), and a
    // blank transcript would produce a useless embedding regardless.
    throw new Error("La transcripción no puede estar vacía.");
  }

  const slug = voiceSlug(input.displayName);

  const res = await comfyFetch(comfyUrl(["prompt"]), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      prompt: buildRegistrationWorkflow(
        input.audioFilename,
        refText,
        slug,
        input.maxSeconds ?? REF_AUDIO_MAX_SECONDS,
      ),
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload?.error?.message ?? payload?.error ?? `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return payload.prompt_id as string;
}
