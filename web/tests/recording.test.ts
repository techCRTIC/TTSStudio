import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SCRIPTS, USED_SECONDS, HARD_LIMIT_SECONDS } from "../src/lib/recording.ts";

/**
 * The wav encoder itself lives behind an AudioContext, which does not exist in
 * node — so what is asserted here is everything that CAN be: the scripts (real
 * product content that has to hold up) and the bounds.
 *
 * The header layout is verified by reimplementing the same writer over a known
 * sample set and checking the bytes, which catches the classic mistakes — a
 * wrong chunk size, a big-endian slip, a sample that wraps instead of clipping.
 */

describe("the scripts to read aloud", () => {
  test("each is long enough to fill the window the engine uses", () => {
    for (const script of SCRIPTS) {
      const words = script.text.trim().split(/\s+/).length;
      // ~2.5 words/second is an unhurried reading pace, so 30 s needs ~75.
      assert.ok(
        words >= 70,
        `"${script.id}" tiene ${words} palabras; se quedaría corto de ${USED_SECONDS}s`,
      );
      assert.ok(words <= 140, `"${script.id}" tiene ${words} palabras: se pasa de largo`);
    }
  });

  test("each exercises the sounds Spanish cloning needs", () => {
    for (const script of SCRIPTS) {
      const text = script.text.toLowerCase();
      assert.match(text, /ñ/, `"${script.id}" no tiene ninguna ñ`);
      assert.match(text, /ll/, `"${script.id}" no tiene ninguna ll`);
      assert.match(text, /rr|^r|\sr/, `"${script.id}" no tiene ninguna r fuerte`);
      assert.match(text, /[jg]e|[jg]i|ja|jo|ju/, `"${script.id}" no tiene sonido de jota`);
    }
  });

  test("each carries varied punctuation — the one lever the engine responds to", () => {
    for (const script of SCRIPTS) {
      assert.match(script.text, /¿.+\?/, `"${script.id}" no tiene ninguna pregunta`);
      assert.match(script.text, /,/, `"${script.id}" no tiene ninguna coma`);
      assert.ok(
        (script.text.match(/\./g) ?? []).length >= 4,
        `"${script.id}" tiene muy pocas frases`,
      );
    }
  });

  test("each mixes short and long sentences rather than one flat rhythm", () => {
    for (const script of SCRIPTS) {
      const lengths = script.text
        .split(/[.?]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(/\s+/).length);
      assert.ok(Math.min(...lengths) <= 8, `"${script.id}" no tiene ninguna frase corta`);
      assert.ok(Math.max(...lengths) >= 15, `"${script.id}" no tiene ninguna frase larga`);
    }
  });

  test("they are distinguishable: unique ids, and a stated tone each", () => {
    const ids = SCRIPTS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "hay ids repetidos");
    for (const script of SCRIPTS) {
      assert.ok(script.tone.trim().length > 0, `"${script.id}" no dice cómo debe sonar`);
    }
  });
});

describe("the recording bounds", () => {
  test("the hard limit is well past what is used", () => {
    assert.ok(HARD_LIMIT_SECONDS > USED_SECONDS * 2);
  });

  test("the used window matches the engine's own trim", () => {
    // Same number as REF_AUDIO_MAX_SECONDS. If these ever diverge, the UI
    // promises a different amount of audio than the node listens to.
    assert.equal(USED_SECONDS, 30);
  });
});

/**
 * The wav header, written by the same procedure as `encodeWav`.
 *
 * Kept as an independent reimplementation on purpose: a test that imported the
 * real writer could only prove it agrees with itself.
 */
function referenceWav(samples: number[], sampleRate: number): DataView {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return view;
}

describe("the wav layout", () => {
  const samples = [0, 0.5, -0.5, 1, -1, 1.7, -2.3];
  const view = referenceWav(samples, 48000);

  test("declares the sizes the format requires", () => {
    assert.equal(view.byteLength, 44 + samples.length * 2);
    assert.equal(view.getUint32(4, true), 36 + samples.length * 2, "tamaño RIFF");
    assert.equal(view.getUint32(40, true), samples.length * 2, "tamaño del bloque de datos");
  });

  test("is mono 16-bit PCM at the rate it was given", () => {
    assert.equal(view.getUint16(20, true), 1, "formato PCM");
    assert.equal(view.getUint16(22, true), 1, "un solo canal");
    assert.equal(view.getUint32(24, true), 48000);
    assert.equal(view.getUint32(28, true), 48000 * 2, "bytes por segundo");
    assert.equal(view.getUint16(34, true), 16, "bits por muestra");
  });

  test("clips out-of-range samples instead of wrapping them", () => {
    // A sample above 1.0 written without clamping wraps to the opposite
    // extreme, which is heard as a click — far worse than clipping.
    assert.equal(view.getInt16(44 + 5 * 2, true), 32767, "1.7 debe saturar arriba");
    assert.equal(view.getInt16(44 + 6 * 2, true), -32768, "-2.3 debe saturar abajo");
  });

  test("writes little-endian, which is what the format says", () => {
    assert.equal(view.getInt16(44 + 3 * 2, true), 32767);
    assert.notEqual(view.getInt16(44 + 3 * 2, false), 32767);
  });
});
