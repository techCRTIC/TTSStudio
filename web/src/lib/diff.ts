/**
 * What actually changed between what you wrote and what the model proposes.
 *
 * WHY THIS EXISTS
 *   The rewrite can change the meaning of a sentence, and reasoning only made
 *   that rarer, not impossible. Measured on this machine with qwen3:4b, same
 *   input, three runs: twice it kept "el año pasado cambió todo para nosotros",
 *   once it returned "Cambié todo para nosotros" — every accent fixed, and the
 *   subject of the sentence quietly replaced.
 *
 *   The panel already asks the user to read the proposal before accepting it.
 *   That is not enough on its own: finding a one-letter change inside a
 *   rewritten paragraph is exactly the thing people are worst at. So the change
 *   is SHOWN rather than left to be found.
 *
 * WHY IT COMPARES WORDS FOLDED, AND SHOWS THEM WHOLE
 *   Almost every word comes back repunctuated and re-accented — that is the
 *   entire point of the feature — so a literal diff would mark the whole text
 *   and say nothing. Words are compared with their accents and case folded
 *   away, which makes the EXPECTED corrections invisible ("sabias" → "sabías"
 *   is the same word) while a real substitution still stands out
 *   ("cambio" → "cambie" after folding, so "cambió" → "cambié" is flagged).
 *
 * Pure: no DOM, no network. See ../tests/diff.test.ts.
 */

export type DiffPart = {
  text: string;
  kind: "same" | "added" | "removed";
};

/** Words, keeping everything else out of the comparison. */
function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * The form two words are compared in.
 *
 * Case, accents and surrounding punctuation are all things this feature is
 * SUPPOSED to change, so none of them may count as a difference. The letters
 * are what is left, and a change in those is a change in the word.
 */
export function fold(word: string): string {
  return (
    word
      // ⚠️ The ñ is protected BEFORE decomposition, and this is not pedantry.
      // NFD turns "ñ" into "n" plus a combining tilde, and stripping combining
      // marks would then fold "año" and "ano" into the same word — so a rewrite
      // that turned "año" into "ano" would pass in silence. In Spanish those
      // are two different words, and this project has a blocking alarm for
      // exactly that pair. A test catches it if this ever comes back.
      .replace(/[ñÑ]/g, "\u0001")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\u0001]/g, "")
  );
}

/**
 * A word-level diff of `before` against `after`.
 *
 * Classic longest-common-subsequence over the folded words. The table is
 * bounded by the model's own input ceiling (2048 characters), so the quadratic
 * cost is a few hundred squared at worst — nothing on a machine that runs a
 * language model for the same feature.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const fa = a.map(fold);
  const fb = b.map(fold);

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        fa[i] === fb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = parts[parts.length - 1];
    // Runs are merged so the interface renders one mark per changed phrase
    // instead of one per word.
    if (last && last.kind === kind) last.text += ` ${text}`;
    else parts.push({ text, kind });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (fa[i] === fb[j]) {
      // Same word: show the PROPOSAL's spelling, which carries the corrected
      // accent. Showing the original here would hide the fix that was wanted.
      push(b[j], "same");
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(a[i], "removed");
      i += 1;
    } else {
      push(b[j], "added");
      j += 1;
    }
  }
  while (i < a.length) {
    push(a[i], "removed");
    i += 1;
  }
  while (j < b.length) {
    push(b[j], "added");
    j += 1;
  }

  return parts;
}

/** Whether anything beyond spelling and punctuation moved. */
export function hasWordChanges(parts: DiffPart[]): boolean {
  return parts.some((p) => p.kind !== "same");
}
