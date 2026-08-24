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
        options: { temperature: options.temperature },
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
