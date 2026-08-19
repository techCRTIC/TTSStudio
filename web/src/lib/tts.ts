/**
 * Building and submitting the Qwen3-TTS voice-clone graph.
 *
 * The app uses the CACHED graph (Qwen3LoadPrompt): the voice is a prompt file
 * already computed on disk, so a generation only varies text and seed. The
 * uncached path recomputes the voice embedding from a reference wav on every
 * call, which is waste once the voice exists.
 */

import { comfyFetch, comfyUrl } from "./comfy";

export type Voice = { id: string; label: string };

export type GenerationStatus =
  | { state: "queued"; position: number | null }
  | { state: "running" }
  | { state: "done"; audioUrl: string; filename: string }
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

export function buildWorkflow(text: string, voiceId: string, seed: number) {
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
        seed,
        language: "Spanish",
        max_new_tokens: 4096,
      },
    },
    "4": {
      class_type: "SaveAudio",
      inputs: { audio: ["3", 0], filename_prefix: "ttsstudio" },
    },
  };
}

/** Submit a graph and return ComfyUI's prompt id. */
export async function submit(text: string, voiceId: string, seed: number): Promise<string> {
  const res = await comfyFetch(comfyUrl(["prompt"]), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify({ prompt: buildWorkflow(text, voiceId, seed) }),
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
