/**
 * The two measured levers of TTS quality: spelling and punctuation.
 *
 * WHERE THIS COMES FROM — it is measured, not assumed
 *   The `voz-local` skill (research `comfy-mcp`, 2026-08-18/19) established two
 *   things by generating audio and having a human listen:
 *
 *     1. SPELLING. Spanish written without accents makes the model stress the
 *        wrong syllable ("ficcion" -> FIC-cion instead of fic-CIÓN), and a
 *        misplaced stress is one of the strongest signals that a voice sounds
 *        FOREIGN. Fixing the spelling changed the delivery by +15% to +29%.
 *     2. PUNCTUATION. Rewriting with ellipses, short sentences and real
 *        questions moves the rhythm 3.5x more than the `instruct` parameter of
 *        a fine-tuned model (+54% vs +15%) — and it is free.
 *
 *   Both fail SILENTLY: the model does not complain, the graph validates, the
 *   audio generates, and it sounds wrong. In the session that produced those
 *   findings, ~25 audios were generated before a human heard the first one, and
 *   ALL of them had badly written text. No objective metric could see it.
 *
 * WHY THIS IS NOT A MODEL
 *   Almost none of this needs one. Detecting an un-accented text, an `?`
 *   without its `¿`, digits where words belong, or flat prosody is arithmetic
 *   over the string; converting "31/12/2026" into words is a lookup table with
 *   Spanish agreement rules. Those are `execution/tts_revisar_texto.py` and
 *   `execution/tts_normalizar_texto.py`, both pure stdlib and both deterministic
 *   — Layer 3 of CLAUDE.md. A language model is reserved for the one part that
 *   is genuinely judgement: rewriting the rhythm. See ./llm.
 *
 * Server-only: it spawns processes.
 */

import { runScriptJson } from "./python.ts";

/** Beyond this, the caller is not writing a script, and argv has limits. */
const MAX_INPUT_CHARS = 20_000;

export type Severity = "BLOQUEANTE" | "AVISO";

export type Finding = {
  /**
   * ⚠️ The distinction is load-bearing and was paid for in lost audio.
   * BLOQUEANTE means "generating this will produce a bad voice" — an
   * ASCII-fied text, an "ano" that should be "año". The interface must not
   * render it as a polite suggestion.
   */
  level: Severity;
  /** Stable identifier; the interface keys behaviour off this, not the prose. */
  code: string;
  message: string;
  action: string;
  examples?: string[];
};

export type Review = {
  characters: number;
  words: number;
  sentences: number;
  wordsPerSentence: number;
  hasDiacritics: boolean;
  findings: Finding[];
  blocking: number;
};

export type Normalization = {
  text: string;
  /**
   * Things a human has to decide, chiefly acronyms.
   *
   * The normalizer refuses to guess how "CRTIC" is pronounced — spelled out or
   * read as a word — because getting it wrong sounds worse than asking. These
   * are surfaced, never silently resolved.
   */
  warnings: string[];
};

type RawFinding = {
  nivel: Severity;
  codigo: string;
  mensaje: string;
  accion: string;
  ejemplos?: string[] | null;
};

type RawReview = {
  caracteres: number;
  palabras: number;
  frases: number;
  palabras_por_frase: number;
  tiene_diacriticos: boolean;
  problemas: RawFinding[];
  bloqueantes: number;
};

function assertSize(text: string): void {
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `El texto tiene ${text.length} caracteres; el máximo que se revisa de una vez es ${MAX_INPUT_CHARS}.`,
    );
  }
}

/**
 * What is wrong with this text, and why it matters.
 *
 * ⚠️ The script exits 1 when it finds something blocking. That is a SUCCESSFUL
 * review with a bad verdict, not a failure — `runScriptJson` hands back the code
 * rather than throwing on it precisely so this reads correctly here.
 */
export async function reviewText(text: string): Promise<Review> {
  assertSize(text);

  const { data } = await runScriptJson<RawReview>(
    "tts_revisar_texto.py",
    [text, "--json"],
    // `tts_revisar_texto.py` es stdlib pura, así que no exige el entorno del
    // proyecto (ADR-009 D6.2). Y esto corre mientras el usuario escribe: pedirle
    // un entorno que no tiene apagaba la revisión entera en silencio.
    { timeoutMs: 20_000, stdlibOnly: true },
  );

  return {
    characters: data.caracteres,
    words: data.palabras,
    sentences: data.frases,
    wordsPerSentence: data.palabras_por_frase,
    hasDiacritics: data.tiene_diacriticos,
    blocking: data.bloqueantes,
    findings: (data.problemas ?? []).map((p) => ({
      level: p.nivel,
      code: p.codigo,
      message: p.mensaje,
      action: p.accion,
      ...(p.ejemplos ? { examples: p.ejemplos } : {}),
    })),
  };
}

/**
 * Numbers, dates, times and amounts in their spoken form.
 *
 * Deterministic and safe to apply without asking: "31/12/2026" has exactly one
 * correct reading in Spanish, so proposing it is not a judgement call. What IS
 * a judgement call — acronyms — comes back as a warning instead.
 */
export async function normalizeText(text: string): Promise<Normalization> {
  assertSize(text);

  const { data } = await runScriptJson<{ texto: string; avisos: string[] }>(
    "tts_normalizar_texto.py",
    [text, "--json"],
    { timeoutMs: 20_000 },
  );

  return { text: data.texto, warnings: data.avisos ?? [] };
}
