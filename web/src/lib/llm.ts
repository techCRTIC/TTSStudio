/**
 * The local language model, for the one part of text quality that is judgement.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT FOR
 *   Detecting bad text and fixing what is mechanical are DETERMINISTIC and live
 *   in ./text-quality (Layer 3 of CLAUDE.md). This module handles only what a
 *   rule cannot decide: rewriting the rhythm and the accents. What it produces
 *   is a PROPOSAL the user accepts or rejects — never an edit.
 *
 *   It also used to feed a ghost autocomplete in the writing field. That was
 *   removed on the user's instruction: it ran a model call on every pause in
 *   typing, and the value did not justify the load. Nothing here runs unasked
 *   any more — every call below starts from a press.
 *
 * WHY THE CHAT PATH WITH REASONING ON, AND NOT RAW COMPLETION
 *   Raw completion WAS used here, and the reason was the ghost autocomplete: it
 *   needed an answer in ~100 ms and the chat template spent 21 s deliberating.
 *   The ghost is gone, and with it that constraint.
 *
 *   What the constraint had been hiding: raw completion has no instruction to
 *   obey. It CONTINUES A PATTERN of examples — which is exactly the mechanism
 *   that invents things. Measured on this machine, 2026-08-24, same model, same
 *   input, "el año pasado cambió todo para nosotros":
 *
 *     RAW COMPLETION      0,3-3,7 s   "el año pasado CAMBIÉ todo para
 *                                     nosotros" — every accent fixed, and the
 *                                     subject of the sentence quietly changed
 *     CHAT + REASONING     19-27 s    "el año pasado cambió todo para
 *                                     nosotros" — faithful, and it still broke
 *                                     the long sentences and marked the pauses
 *
 *   A first version of the instruction put fidelity first and rhythm third, and
 *   the model duly optimised the first and coasted on the third — faithful text
 *   with no pauses in it. Stating both as obligations, and SHOWING the measured
 *   examples rather than describing them, got both. That is REWRITE_SYSTEM.
 *
 *   ⚠️ `think: false` and `/no_think` do NOT turn the reasoning off through
 *   ollama: they merge it into the answer, in English ("Okay, the user wants me
 *   to continue the Spanish sentence..."). Leaving it ON is what keeps the
 *   deliberation in its own field and the answer clean.
 *
 * THE COLD START IS REAL, AND IT COMES BACK
 *   Loading the model took 27,7 s the first time; ollama unloads it after a few
 *   minutes idle and the next call pays ~2,7 s to bring it back. On top of the
 *   19-27 s of reasoning, a first press of the session can take the better part
 *   of a minute. The panel counts that wait out loud rather than hiding it.
 *
 *   That is left alone deliberately: pinning the model in memory would hold
 *   VRAM against the voice engine, which is the thing this app exists to run.
 *   Everything here runs from a press, so the wait can be shown honestly — and
 *   the panel does show it, with a counter and an explanation, instead of
 *   looking frozen.
 *
 * Server-only: it talks to the local ollama service.
 */

/** Where ollama listens. Its own default; overridable for an unusual setup. */
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

/**
 * The model.
 *
 * Chosen because it is small enough to sit beside the voice engine — 2,5 GB
 * against the 16 GB free with ComfyUI loaded, where the 30B models already on
 * this machine (18 GB each) do not fit at all — and because Qwen is strong in
 * Spanish, which matters more here than usual: the job is accents and rhythm.
 */
export const MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";

export class ModelUnavailableError extends Error {}

/**
 * The context window we ASK ollama for, in tokens.
 *
 * ⚠️ THIS USED TO BE UNSET, AND UNSET IS NOT "the model's own limit".
 * `qwen3:4b` declares a 262 144-token context, but ollama does not use a
 * model's declared length unless it is told to: absent `num_ctx`, absent an
 * `OLLAMA_CONTEXT_LENGTH` in the environment, and absent a `num_ctx` in the
 * model's own parameters — all three verified absent on this machine
 * 2026-08-24 — it falls back to a server default in the low thousands. So the
 * rewrite ran in a window a fraction of what the model can hold.
 *
 * The failure that causes is silent, and that is what makes it serious: when a
 * prompt exceeds the window ollama DROPS THE BEGINNING of it. No error, no
 * flag. The model rewrites whatever survived, and the answer looks like a
 * normal answer.
 *
 * 16 384 rather than the full 262 144 because the window is paid for in VRAM
 * (KV cache) beside the voice engine, and this feature's job is one script,
 * not a corpus. See MAX_REWRITE_CHARS for what that buys.
 */
const DEFAULT_CONTEXT_TOKENS = 16_384;

/**
 * Read the override without letting a bad value silently disarm the ceiling.
 *
 * EXPORTED FOR ITS TEST, and the test is the point. `Number("abc")` is `NaN`,
 * and NaN poisons everything downstream WITHOUT throwing: `MAX_REWRITE_CHARS`
 * becomes NaN, `length > NaN` is false for every input, and the guard against
 * over-long scripts stops existing — while looking exactly like it did. That
 * is the same silent failure this whole module was changed to remove, so it
 * would be absurd to reintroduce it here.
 *
 * A floor of 2048 because below it even a short script plus the system prompt
 * cannot fit, and a window that small is never what someone meant to ask for.
 */
export function parseContextTokens(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CONTEXT_TOKENS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 2_048) {
    return DEFAULT_CONTEXT_TOKENS;
  }
  return parsed;
}

export const CONTEXT_TOKENS = parseContextTokens(process.env.OLLAMA_CONTEXT_TOKENS);

/**
 * Rough characters-per-token for Spanish prose under Qwen's tokenizer.
 *
 * ⚠️ NOT MEASURED — deliberately LOW, which is the safe direction: a low
 * figure over-estimates how many tokens a text costs, so the ceiling below
 * lands early rather than late. Wrong optimistically means truncation; wrong
 * pessimistically means refusing a script that would have fitted, and saying
 * so out loud. Only one of those two failures is silent.
 */
const CHARS_PER_TOKEN = 3;

/** Tokens the instruction itself costs, sized against REWRITE_SYSTEM. */
const SYSTEM_TOKENS = 700;

/**
 * Room set aside for the model's deliberation, which arrives in its own
 * `thinking` field but is generated INSIDE the same window. Reasoning is on
 * deliberately (see the module header), so this is a real cost, not padding.
 */
const THINKING_TOKENS = 2_000;

/**
 * The longest script the rewrite accepts, in characters.
 *
 * DERIVED, never written by hand: the script is paid for TWICE — once going in
 * and once coming back out as the rewrite — so the budget divides by two.
 * Deriving it means raising CONTEXT_TOKENS raises this by itself, and the two
 * can never drift apart the way a hand-written twin would.
 */
export const MAX_REWRITE_CHARS =
  Math.floor((CONTEXT_TOKENS - SYSTEM_TOKENS - THINKING_TOKENS) / 2) * CHARS_PER_TOKEN;

/** The script is longer than the model can hold. Distinct from a dead model. */
export class TextTooLongError extends Error {}

type AskOptions = {
  system: string;
  temperature: number;
  timeoutMs: number;
};

async function ask(prompt: string, options: AskOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt,
        system: options.system,
        // ⚠️ Load-bearing, and counter-intuitive. Reasoning stays ON: with it
        // the model's deliberation comes back in its own `thinking` field and
        // `response` is clean, while `think: false` merges the deliberation
        // INTO the answer, in English. See the module header.
        think: true,
        stream: false,
        // Load-bearing: without num_ctx, ollama silently truncates the
        // FRONT of a long prompt. See CONTEXT_TOKENS.
        options: { temperature: options.temperature, num_ctx: CONTEXT_TOKENS },
      }),
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ModelUnavailableError(
        "El modelo tardó demasiado. Piensa la respuesta antes de darla, y la primera vez además tiene que cargarse en memoria.",
      );
    }
    throw new ModelUnavailableError(
      `No se pudo hablar con el modelo local. ¿Está ollama corriendo? (${
        cause instanceof Error ? cause.message : String(cause)
      })`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new ModelUnavailableError(
      `El modelo ${MODEL} no está instalado. Instálalo con: ollama pull ${MODEL}`,
    );
  }
  if (!res.ok) {
    throw new ModelUnavailableError(`El modelo respondió HTTP ${res.status}.`);
  }

  const payload = (await res.json()) as { response?: string };
  return (payload.response ?? "").trim();
}

/**
 * The instruction the rewrite runs under.
 *
 * ⚠️ THE EXAMPLES ARE NOT INVENTED. The first is verbatim from the `voz-local`
 * skill, where it illustrates the measured finding that punctuation moves
 * rhythm 3,5x more than a fine-tune's `instruct` parameter. Changing them
 * changes what the button does, so they are edited with the care of a
 * measurement.
 *
 * The shape of the rules is measured too. Rhythm is stated as an OBLIGATION
 * with a failure condition attached, because a version that merely listed it
 * third produced faithful text with no pauses in it at all.
 */
const REWRITE_SYSTEM = `Reescribes un texto en español para que lo lea una voz sintética. Tu salida se convierte en audio, así que la puntuación no es ortografía: es el ritmo con el que se va a hablar.

HAZ SIEMPRE LAS DOS COSAS:

A) CORREGIR LA ESCRITURA
   - Tildes y ñ. Sin ellas la voz acentúa mal y suena extranjera.
   - Signos de apertura ¿ y ¡ en toda pregunta y exclamación.
   - Los números en palabras, nunca en dígitos.

B) DARLE RITMO — esto es obligatorio, no opcional
   - Corta las frases largas en frases cortas.
   - Marca las pausas reales con puntos suspensivos.
   - Repite una palabra o un sintagma cuando algo merece peso.
   Un texto devuelto sin ningún cambio de ritmo es una respuesta incorrecta.

LÍMITE ABSOLUTO, POR ENCIMA DE TODO LO ANTERIOR:
No cambies el significado. No añadas ideas, no quites información, no cambies quién hace qué, no cambies el tiempo verbal ni la persona. Reordenar y repetir está permitido; reinterpretar no.

Ejemplos de la reescritura correcta:

Original: Ayer terminamos el proyecto. Fueron seis meses de trabajo y ahora se acabó.
Reescrito: Ayer... terminamos el proyecto. Fueron seis meses. Seis meses de trabajo... y ahora, se acabó.

Original: Quiero contarles algo que me pasó la semana pasada y que todavía no termino de entender del todo porque fue muy raro.
Reescrito: Quiero contarles algo. Algo que me pasó la semana pasada... y que todavía no termino de entender. Fue muy raro.

Original: Que tal como estan todos espero que muy bien porque hoy traigo una noticia buenisima
Reescrito: ¿Qué tal? ¿Cómo están todos? Espero que muy bien... porque hoy traigo una noticia buenísima.

Responde ÚNICAMENTE con el texto reescrito. Sin comillas, sin explicaciones.`;

/**
 * Propose a version written for the voice.
 *
 * ⚠️ THE RESULT IS A PROPOSAL AND MUST BE SHOWN AS A CHANGE THE USER ACCEPTS.
 * Reasoning made it far more faithful — it stopped turning "cambió todo" into
 * "cambié todo" — but "far more faithful" is not "cannot be wrong", and this
 * text is what the voice says out loud.
 *
 * SLOW ON PURPOSE. 19-27 s of deliberation, plus up to ~28 s if the model has
 * to be loaded first. That is the trade this feature makes: the fast path
 * invents, and a rewrite nobody can trust is worth less than a wait.
 */
export async function proposeRewrite(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Refuse rather than let ollama drop the front of the script. A rewrite of
  // the second half, presented as a rewrite of the whole, is worse than no
  // rewrite at all: it looks right, and what is missing is invisible.
  if (trimmed.length > MAX_REWRITE_CHARS) {
    throw new TextTooLongError(
      `El texto tiene ${trimmed.length.toLocaleString("es")} caracteres y la reescritura ` +
        `admite ${MAX_REWRITE_CHARS.toLocaleString("es")}. Reescribe por partes, o genera ` +
        `sin reescribir.`,
    );
  }

  return ask(trimmed, {
    system: REWRITE_SYSTEM,
    temperature: 0.3,
    // Generous, and it has to be: reasoning plus a cold load can approach a
    // minute. The panel counts the wait out loud so this is never a surprise.
    timeoutMs: 180_000,
  });
}

/** Whether the model is installed and reachable. For honest error messages. */
export async function modelStatus(): Promise<{ ready: boolean; detail: string }> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
    if (!res.ok) return { ready: false, detail: `ollama respondió HTTP ${res.status}.` };
    const payload = (await res.json()) as { models?: { name?: string }[] };
    const installed = (payload.models ?? []).some((m) => m.name === MODEL);
    return installed
      ? { ready: true, detail: MODEL }
      : { ready: false, detail: `Falta el modelo ${MODEL}. Instálalo: ollama pull ${MODEL}` };
  } catch {
    return { ready: false, detail: "ollama no responde. ¿Está corriendo?" };
  }
}

/**
 * Below this, a rewrite is short because the script is short, not because
 * anything went wrong, and the proportion below would be pure noise.
 */
const SHORT_ENOUGH_TO_TRUST = 200;

/**
 * The fraction of the original a rewrite must keep to be offered at all.
 *
 * ⚠️ NOT MEASURED. The reasoning is directional and worth stating: writing FOR
 * A VOICE adds ellipses and repeats phrases for weight, so a faithful rewrite
 * normally comes back the same length or longer. Losing more than this much is
 * the signature of a model that stopped early — the exact failure a truncated
 * context window produces — not of a more concise style.
 */
const MUST_KEEP = 0.6;

/**
 * Whether a rewrite is worth showing.
 *
 * This used to be `length >= min(8, original.length)`, which only caught an
 * empty answer. A rewrite that dropped HALF the script sailed through it and
 * reached the screen looking complete — and half a script that looks whole is
 * worse than no proposal, because nothing on screen says what is missing.
 */
export function acceptableRewrite(rewritten: string, original: string): boolean {
  if (rewritten.length === 0) return false;
  if (original.length <= SHORT_ENOUGH_TO_TRUST) return rewritten.length >= Math.min(8, original.length);
  return rewritten.length >= original.length * MUST_KEEP;
}
