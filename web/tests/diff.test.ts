import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fold, hasWordChanges, wordDiff } from "../src/lib/diff.ts";

/**
 * The diff exists to catch ONE thing: the rewrite changing a word rather than
 * correcting it. Reasoning made that rarer and not impossible — measured, same
 * input, three runs, one of which returned "Cambié todo" where the user wrote
 * "cambió todo" — so the interface has to show it instead of hoping the reader
 * spots it in a rewritten paragraph.
 *
 * Which makes the two properties below the whole contract:
 *   · an expected correction must be INVISIBLE, or the marks are noise;
 *   · a real substitution must be VISIBLE, or the guard does nothing.
 */

describe("fold — what counts as the same word", () => {
  test("accents and case do not make a different word", () => {
    assert.equal(fold("sabias"), fold("sabías"));
    assert.equal(fold("Que"), fold("qué"));
    assert.equal(fold("ANOS"), fold("anos"));
  });

  test("but ñ does, because it is a different letter", () => {
    // "año" and "ano" are different words, and the reviewer has its own
    // blocking alarm for exactly this pair.
    assert.notEqual(fold("año"), fold("ano"));
  });

  test("punctuation around a word is not part of it", () => {
    assert.equal(fold("esto..."), fold("esto"));
    assert.equal(fold("¿Qué?"), fold("que"));
    assert.equal(fold("bien,"), fold("bien"));
  });

  test("a real change of letters survives folding", () => {
    // THE case this whole module exists for.
    assert.notEqual(fold("cambió"), fold("cambié"));
  });
});

describe("wordDiff — expected corrections stay quiet", () => {
  test("a pure accent-and-punctuation rewrite shows no changes at all", () => {
    const parts = wordDiff(
      "no se si sabias esto pero fue muy dificil",
      "No sé si sabías esto... pero fue muy difícil.",
    );
    assert.equal(hasWordChanges(parts), false, JSON.stringify(parts));
  });

  test("the corrected spelling is what gets shown, not the original", () => {
    // Otherwise the panel would display the proposal with the user's own
    // mistakes back in it.
    const parts = wordDiff("sabias esto", "sabías esto...");
    assert.equal(parts.map((p) => p.text).join(" "), "sabías esto...");
  });

  test("splitting a sentence is not a word change", () => {
    const parts = wordDiff(
      "Fueron seis meses de trabajo y ahora se acabó",
      "Fueron seis meses. De trabajo... y ahora, se acabó.",
    );
    assert.equal(hasWordChanges(parts), false);
  });
});

describe("wordDiff — real changes are marked", () => {
  test("catches the substitution that motivated this module", () => {
    const parts = wordDiff(
      "el ano pasado cambio todo para nosotros",
      "el año pasado cambié todo para nosotros",
    );
    assert.equal(hasWordChanges(parts), true);

    const added = parts.filter((p) => p.kind === "added").map((p) => p.text);
    const removed = parts.filter((p) => p.kind === "removed").map((p) => p.text);
    assert.ok(added.join(" ").includes("cambié"), `añadido: ${added}`);
    assert.ok(removed.join(" ").includes("cambio"), `quitado: ${removed}`);
  });

  test("catches an idea the model invented", () => {
    const parts = wordDiff(
      "Empezamos el proyecto.",
      "Empezamos el proyecto más ambicioso de nuestra vida.",
    );
    const added = parts.filter((p) => p.kind === "added").map((p) => p.text).join(" ");
    assert.match(added, /ambicioso/);
  });

  test("catches information the model dropped", () => {
    const parts = wordDiff(
      "Fueron seis meses de trabajo en Santiago.",
      "Fueron seis meses de trabajo.",
    );
    const removed = parts.filter((p) => p.kind === "removed").map((p) => p.text).join(" ");
    assert.match(removed, /Santiago/);
  });

  test("a repetition for emphasis reads as an addition, which it is", () => {
    // The skill's own measured style repeats a phrase for weight. It is a real
    // change to the words, so marking it is correct — the user should see that
    // the model chose to repeat something.
    const parts = wordDiff(
      "Fueron seis meses de trabajo.",
      "Fueron seis meses. Seis meses de trabajo.",
    );
    assert.equal(hasWordChanges(parts), true);
  });
});

describe("wordDiff — the degenerate cases", () => {
  test("identical text has nothing to report", () => {
    assert.equal(hasWordChanges(wordDiff("hola qué tal", "hola qué tal")), false);
  });

  test("empty sides do not crash", () => {
    assert.deepEqual(wordDiff("", ""), []);
    assert.equal(wordDiff("", "hola").every((p) => p.kind === "added"), true);
    assert.equal(wordDiff("hola", "").every((p) => p.kind === "removed"), true);
  });

  test("consecutive changes are merged into one mark", () => {
    // One mark per changed phrase, not one per word: a per-word mark turns a
    // rewritten clause into confetti.
    const parts = wordDiff("uno dos tres", "uno cuatro cinco seis tres");
    assert.equal(parts.filter((p) => p.kind === "added").length, 1);
  });
});
