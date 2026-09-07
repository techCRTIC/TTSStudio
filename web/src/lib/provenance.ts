/**
 * Who a voice belongs to. See ADR-005.
 *
 * A voice in this app is a clone of a real human being, and the roadmap's
 * Phase 2 asks for that to be VISIBLE — "las voces son de personas
 * identificables". This module is the shape of that record and the rules that
 * keep it honest.
 *
 * WHERE IT LIVES
 *   In `<slug>.json`, next to `<slug>.safetensors` in the engine's prompts
 *   directory. It travels with the voice and dies with it, which `localStorage`
 *   could not do: clearing site data would leave the voice file on disk with no
 *   record of whose voice it is — losing exactly what this exists to keep.
 *
 * WHO WINS WHEN THEY DISAGREE
 *   The engine. `listVoices()` is still the list of voices; this is a
 *   decoration joined to it by id. A voice with no record shows as "sin
 *   procedencia registrada", which is the truth. A record with no voice is
 *   ignored. Neither can invent or hide a voice.
 *
 * WHAT IS NOT HERE, ON PURPOSE
 *   The transcript of the reference clip. It is not needed to establish
 *   provenance and it is a sentence a real person said — CLAUDE.md § 3 says to
 *   keep only what the task needs. There is no contact field either, and one
 *   must not be added without revisiting ADR-005.
 *
 * Pure: no filesystem, no network. The disk half lives in ./comfy-files.
 */

/** How the reference audio reached the app. */
export const SOURCES = ["upload", "microphone", "pre-existing"] as const;
export type Source = (typeof SOURCES)[number];

/** What each source says in the interface. */
export const SOURCE_LABELS: Record<Source, string> = {
  upload: "de un archivo de audio",
  microphone: "grabada con el micrófono",
  "pre-existing": "ya estaba en el disco",
};

export type Provenance = {
  /**
   * The name AS TYPED, accents intact.
   *
   * This is not a duplicate of the filename: `voiceSlug` strips accents to
   * build a safe path, so "Martín Vega" becomes `martin_vega` and `labelFor`
   * can only ever bring back "Martin Vega". The accent is only recoverable if
   * something wrote it down, and this is that something.
   */
  displayName: string;
  /** Epoch ms. When this person's voice was turned into a clone. */
  registeredAt: number;
  source: Source;
  /** Seconds of audio the embedding was computed from. 0 when unknown. */
  refSeconds: number;
  /**
   * Free text from the user.
   *
   * ⚠️ This is where consent lives — whose voice this is and with what
   * permission. It is the one field that cannot be derived from anything, and
   * the reason the whole record exists.
   */
  note: string;
  /**
   * Filename of the cached sample in ComfyUI's output directory, once one has
   * been generated. Absent until the user first presses play.
   */
  sampleFilename?: string;
};

/** Bounds. Long enough to say something real, short enough to stay a note. */
export const NAME_MAX = 60;
export const NOTE_MAX = 500;

/**
 * The sentence every voice says when previewed.
 *
 * ⚠️ It is THE SAME for every voice, and that is the point: comparing two
 * voices means hearing them say the same words. A per-voice sample would make
 * the library a collection of unrelated clips instead of a way to choose.
 *
 * It is also short on purpose — the user is exploring, not producing, and the
 * wait before the first play is the cost of this whole feature.
 */
export const SAMPLE_TEXT =
  "Hola, esta es mi voz. Así sueno cuando leo un texto en voz alta.";

/**
 * A fixed seed for previews.
 *
 * Same text + same seed + same voice = the same take (measured in session 2).
 * So a preview regenerated after a cache loss sounds identical to the one the
 * user heard before, and two voices differ only by the thing being compared.
 */
export const SAMPLE_SEED = 7;

/**
 * A cap on the preview generation.
 *
 * At the measured 12.56 tokens per second of audio, 256 tokens is about 20
 * seconds — comfortably more than SAMPLE_TEXT needs (~5 s), so it never
 * truncates the sentence, while still bounding a runaway generation. Must stay
 * a multiple of TOKENS_STEP.
 */
export const SAMPLE_MAX_TOKENS = 256;

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Collapse whitespace before measuring: a note that is 500 newlines is not a
  // note, and the length bound should describe content, not formatting.
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Read an unknown blob from disk into a Provenance, or reject it.
 *
 * Returns `null` rather than throwing when the file is not a usable record:
 * a corrupt or hand-edited sidecar must degrade to "sin procedencia
 * registrada", never to a broken voice library. The engine's list is what
 * matters, and it is unaffected by anything in here.
 */
export function parseProvenance(raw: unknown): Provenance | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const displayName = clampText(value.displayName, NAME_MAX);
  if (!displayName) return null;

  const source = SOURCES.includes(value.source as Source)
    ? (value.source as Source)
    : "pre-existing";

  // `Number(null)` is 0, not NaN — a missing value has to be caught BEFORE the
  // conversion or "nothing was sent" silently becomes "zero". This bit a real
  // test in session 2, in options.ts.
  const registeredAt =
    typeof value.registeredAt === "number" && Number.isFinite(value.registeredAt)
      ? value.registeredAt
      : 0;

  const refSeconds =
    typeof value.refSeconds === "number" && Number.isFinite(value.refSeconds)
      ? Math.max(0, Math.round(value.refSeconds))
      : 0;

  const sampleFilename =
    typeof value.sampleFilename === "string" && value.sampleFilename.trim()
      ? value.sampleFilename.trim()
      : undefined;

  return {
    displayName,
    registeredAt,
    source,
    refSeconds,
    note: clampText(value.note, NOTE_MAX),
    ...(sampleFilename ? { sampleFilename } : {}),
  };
}

/**
 * Build a record from what the interface submitted.
 *
 * Separate from `parseProvenance` because the two have different jobs: this one
 * accepts a user's edit and must reject an empty name outright, while the other
 * salvages whatever a file on disk turned out to hold.
 */
export function provenanceFromInput(
  input: Record<string, unknown>,
  fallback?: Provenance,
): Provenance {
  const displayName = clampText(input.displayName, NAME_MAX);
  if (!displayName) {
    throw new Error("La voz necesita un nombre.");
  }

  const source = SOURCES.includes(input.source as Source)
    ? (input.source as Source)
    : (fallback?.source ?? "pre-existing");

  const registeredAt =
    typeof input.registeredAt === "number" && Number.isFinite(input.registeredAt)
      ? input.registeredAt
      : (fallback?.registeredAt ?? 0);

  const refSeconds =
    typeof input.refSeconds === "number" && Number.isFinite(input.refSeconds)
      ? Math.max(0, Math.round(input.refSeconds))
      : (fallback?.refSeconds ?? 0);

  return {
    displayName,
    registeredAt,
    source,
    refSeconds,
    note: clampText(input.note, NOTE_MAX),
    // The cached sample is not the user's to set: it is written by the preview
    // route when a generation actually lands. An edit must not be able to point
    // the player at an arbitrary file.
    ...(fallback?.sampleFilename ? { sampleFilename: fallback.sampleFilename } : {}),
  };
}

/** How the interface describes a voice nobody has documented yet. */
export const UNDOCUMENTED = "Sin procedencia registrada";
