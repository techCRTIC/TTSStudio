import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  NAME_MAX,
  NOTE_MAX,
  parseProvenance,
  provenanceFromInput,
  SAMPLE_MAX_TOKENS,
  SAMPLE_SEED,
  SAMPLE_TEXT,
} from "../src/lib/provenance.ts";
import { normalizeSeed, normalizeTokens, TOKENS_MAX, TOKENS_MIN, TOKENS_STEP } from "../src/lib/tts.ts";

/**
 * Provenance is the record of WHICH REAL PERSON a voice clones (ADR-005), so
 * these tests are about two properties, not about formatting:
 *
 *   1. A bad record degrades to "undocumented" and never to a broken library —
 *      the engine's list is the voice library, and one hand-edited JSON must
 *      not be able to take it down.
 *   2. A record never claims more than it knows. Inventing a registration date
 *      or a source would be worse than admitting ignorance.
 */

describe("parseProvenance — salvaging what is on disk", () => {
  test("rejects what is not a record at all", () => {
    for (const junk of [null, undefined, 42, "texto", [], true]) {
      assert.equal(parseProvenance(junk), null, `${JSON.stringify(junk)} no es una procedencia`);
    }
  });

  test("a record with no name is not a record", () => {
    // The name is the one field that cannot be defaulted: a provenance that
    // does not say whose voice it is documents nothing.
    assert.equal(parseProvenance({ note: "de alguien" }), null);
    assert.equal(parseProvenance({ displayName: "   " }), null);
  });

  test("keeps the accents the slug destroyed", () => {
    // The whole reason displayName is stored: `martin_vega` can never become
    // "Martín Vega" again by any transformation of the filename.
    const p = parseProvenance({ displayName: "Martín Vega" });
    assert.equal(p?.displayName, "Martín Vega");
  });

  test("an unknown source degrades to pre-existing rather than being believed", () => {
    const p = parseProvenance({ displayName: "X", source: "telepatía" });
    assert.equal(p?.source, "pre-existing");
  });

  test("a missing date stays unknown instead of becoming zero-as-a-date", () => {
    // `Number(null)` is 0, not NaN, and 0 is a valid epoch — so an absent value
    // has to be rejected BEFORE any conversion or "we don't know when" turns
    // into "1 de enero de 1970". The interface keys off `> 0`.
    for (const bad of [null, undefined, "ayer", NaN, Infinity]) {
      const p = parseProvenance({ displayName: "X", registeredAt: bad });
      assert.equal(p?.registeredAt, 0, `${String(bad)} no es una fecha`);
    }
  });

  test("refSeconds is never negative and never fractional", () => {
    assert.equal(parseProvenance({ displayName: "X", refSeconds: -30 })?.refSeconds, 0);
    assert.equal(parseProvenance({ displayName: "X", refSeconds: 29.6 })?.refSeconds, 30);
  });

  test("clamps the free-text fields so a file cannot grow without bound", () => {
    const p = parseProvenance({
      displayName: "n".repeat(NAME_MAX + 50),
      note: "o".repeat(NOTE_MAX + 500),
    });
    assert.equal(p?.displayName.length, NAME_MAX);
    assert.equal(p?.note.length, NOTE_MAX);
  });

  test("a note made only of whitespace is an empty note, not a long one", () => {
    const p = parseProvenance({ displayName: "X", note: "  \n\n\t   \n  " });
    assert.equal(p?.note, "");
  });

  test("an empty sampleFilename is absent, not empty", () => {
    // The interface tests this field for existence to decide whether a cached
    // sample can be played. An empty string would pass a naive check and then
    // build a URL pointing at nothing.
    assert.equal(parseProvenance({ displayName: "X", sampleFilename: "  " })?.sampleFilename, undefined);
    assert.equal(parseProvenance({ displayName: "X" })?.sampleFilename, undefined);
  });
});

describe("provenanceFromInput — accepting a user's edit", () => {
  test("refuses to save a record with no name", () => {
    assert.throws(() => provenanceFromInput({ note: "algo" }), /nombre/i);
  });

  test("an edit cannot point the player at an arbitrary file", () => {
    // SECURITY, not tidiness. `sampleFilename` drives both a playback URL and,
    // on delete, a path into ComfyUI's output directory. It is written only by
    // the preview route, from what the ENGINE reported — never from a request
    // body. An edit that tries to set it is ignored outright.
    const record = provenanceFromInput({
      displayName: "X",
      sampleFilename: "../../../../etc/passwd",
    });
    assert.equal(record.sampleFilename, undefined);
  });

  test("an edit keeps the cached sample the preview route wrote", () => {
    const previous = parseProvenance({ displayName: "X", sampleFilename: "ttsstudio_1.flac" })!;
    const record = provenanceFromInput({ displayName: "X", note: "nueva nota" }, previous);
    assert.equal(record.sampleFilename, "ttsstudio_1.flac");
    assert.equal(record.note, "nueva nota");
  });

  test("editing the note does not reset when the voice was registered", () => {
    // Otherwise every edit would quietly rewrite history to "today", which is
    // the one thing a provenance record must never do.
    const previous = parseProvenance({ displayName: "X", registeredAt: 1_700_000_000_000 })!;
    const record = provenanceFromInput({ displayName: "X", note: "n" }, previous);
    assert.equal(record.registeredAt, 1_700_000_000_000);
  });

  test("falls back to the previous source rather than to a guess", () => {
    const previous = parseProvenance({ displayName: "X", source: "microphone" })!;
    assert.equal(provenanceFromInput({ displayName: "X" }, previous).source, "microphone");
    // With nothing to fall back on, the honest answer is "it was already there".
    assert.equal(provenanceFromInput({ displayName: "X" }).source, "pre-existing");
  });
});

describe("the preview sample is a valid generation request", () => {
  /**
   * ⚠️ THIS IS A SEAM. The sample constants are consumed by `submit()`, which
   * runs them through `normalizeSeed`/`normalizeTokens`. If a constant falls
   * outside what those accept, it is silently CHANGED rather than rejected —
   * the preview would still work, so no other test would notice, and the cap
   * would stop being the cap this module documents.
   */
  test("the token cap survives normalization unchanged", () => {
    assert.equal(normalizeTokens(SAMPLE_MAX_TOKENS), SAMPLE_MAX_TOKENS);
    assert.ok(SAMPLE_MAX_TOKENS >= TOKENS_MIN && SAMPLE_MAX_TOKENS <= TOKENS_MAX);
    assert.equal(SAMPLE_MAX_TOKENS % TOKENS_STEP, 0);
  });

  test("the seed survives normalization unchanged", () => {
    // A preview must be reproducible: same voice, same sentence, same seed,
    // same take. A seed the engine silently replaces breaks that.
    assert.equal(normalizeSeed(SAMPLE_SEED), SAMPLE_SEED);
  });

  test("the sentence is short enough that the cap never truncates it", () => {
    // At the measured 12.56 tokens per second of audio, the cap is ~20 s. A
    // sentence that needed more would be cut off mid-word, and the sample
    // would misrepresent the voice.
    assert.ok(SAMPLE_TEXT.length < 120, "la frase de muestra debe seguir siendo corta");
    assert.ok(SAMPLE_TEXT.trim().length > 0);
  });
});
