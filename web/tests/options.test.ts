import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflow,
  normalizeSeed,
  normalizeTokens,
  randomSeed,
  SEED_MIN,
  SEED_MAX_SAFE,
  TOKENS_MIN,
  TOKENS_MAX,
  TOKENS_STEP,
  TOKENS_DEFAULT,
  LANGUAGES,
} from "../src/lib/tts.ts";

/**
 * The bounds here are not invented: they are Qwen3VoiceClone's own INPUT_TYPES
 * (nodes.py:702-719) — seed min 1, max_new_tokens 64..8192 step 64, and a fixed
 * list of 11 languages. A value outside them is a graph ComfyUI rejects, so the
 * clamping is what stands between a slip in the UI and a failed generation.
 */

describe("normalizeSeed", () => {
  test("never returns the zero the engine rejects", () => {
    for (const input of [0, -1, -99999, 0.4]) {
      assert.ok(normalizeSeed(input) >= SEED_MIN, `${input} produjo una semilla inválida`);
    }
  });

  test("clamps above the exactly-representable ceiling", () => {
    assert.equal(normalizeSeed(SEED_MAX_SAFE + 1000), SEED_MAX_SAFE);
  });

  test("keeps a valid seed exactly as given — reproducibility depends on it", () => {
    for (const seed of [1, 42, 1743920118, SEED_MAX_SAFE]) {
      assert.equal(normalizeSeed(seed), seed);
    }
  });

  test("falls back to a usable seed for junk rather than throwing", () => {
    for (const junk of [NaN, Infinity, "hola", null, undefined, {}]) {
      const out = normalizeSeed(junk);
      assert.ok(Number.isInteger(out) && out >= SEED_MIN && out <= SEED_MAX_SAFE);
    }
  });
});

describe("randomSeed", () => {
  test("always lands inside what the engine accepts", () => {
    for (let i = 0; i < 500; i += 1) {
      const seed = randomSeed();
      assert.ok(Number.isInteger(seed), "debe ser entero");
      assert.ok(seed >= SEED_MIN, `${seed} está por debajo del mínimo del motor`);
      assert.ok(seed <= SEED_MAX_SAFE, `${seed} pasa el techo representable`);
    }
  });
});

describe("normalizeTokens", () => {
  test("snaps to the engine's step of 64", () => {
    assert.equal(normalizeTokens(100) % TOKENS_STEP, 0);
    assert.equal(normalizeTokens(4097) % TOKENS_STEP, 0);
    assert.equal(normalizeTokens(2048), 2048);
  });

  test("clamps to the engine's range at both ends", () => {
    assert.equal(normalizeTokens(0), TOKENS_MIN);
    assert.equal(normalizeTokens(-500), TOKENS_MIN);
    assert.equal(normalizeTokens(99999), TOKENS_MAX);
  });

  test("falls back to the default for junk", () => {
    for (const junk of [NaN, "muchos", null, undefined]) {
      assert.equal(normalizeTokens(junk), TOKENS_DEFAULT);
    }
  });
});

describe("buildWorkflow options", () => {
  test("defaults to Spanish rather than letting the model guess", () => {
    const g = buildWorkflow("hola", "voz.safetensors", 42);
    assert.equal(g["3"].inputs.language, "Spanish");
    assert.equal(g["3"].inputs.max_new_tokens, TOKENS_DEFAULT);
  });

  test("carries the chosen language and ceiling into the graph", () => {
    const g = buildWorkflow("hi", "voz.safetensors", 42, {
      language: "English",
      maxNewTokens: 8192,
    });
    assert.equal(g["3"].inputs.language, "English");
    assert.equal(g["3"].inputs.max_new_tokens, 8192);
  });

  test("sanitizes on the way in, so a bad UI value cannot reach the engine", () => {
    const g = buildWorkflow("hola", "voz.safetensors", 0, { maxNewTokens: 99999 });
    assert.ok(g["3"].inputs.seed >= SEED_MIN, "la semilla 0 debía corregirse");
    assert.equal(g["3"].inputs.max_new_tokens, TOKENS_MAX);
  });

  test("offers only languages the node actually declares", () => {
    // The node's list, verbatim from nodes.py:709-712.
    const fromEngine = [
      "Auto",
      "Chinese",
      "English",
      "Japanese",
      "Korean",
      "German",
      "French",
      "Russian",
      "Portuguese",
      "Spanish",
      "Italian",
    ];
    assert.deepEqual([...LANGUAGES].sort(), fromEngine.sort());
  });
});
