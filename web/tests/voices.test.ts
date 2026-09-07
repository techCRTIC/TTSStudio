import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  voiceSlug,
  assertAudioFilename,
  buildRegistrationWorkflow,
} from "../src/lib/voices.ts";

describe("voiceSlug", () => {
  // These are the security tests. Qwen3SavePrompt builds its path with a bare
  // os.path.join and sanitizes nothing (nodes.py:616), so this function is the
  // only thing preventing a write outside the voice directory.
  test("a path traversal cannot survive the slug", () => {
    for (const attack of [
      "../../../evil",
      "..\\..\\evil",
      "/etc/passwd",
      "C:\\Windows\\System32\\evil",
      "voz/../../fuera",
    ]) {
      const slug = voiceSlug(attack);
      assert.doesNotMatch(slug, /[./\\]/, `"${attack}" produjo "${slug}", que aún navega rutas`);
      assert.match(slug, /^[a-z0-9_]+$/, `"${attack}" produjo "${slug}"`);
    }
  });

  test("a null byte or separator cannot survive either", () => {
    assert.match(voiceSlug("voz\u0000mala"), /^[a-z0-9_]+$/);
    assert.match(voiceSlug("a:b*c?d"), /^[a-z0-9_]+$/);
  });

  test("strips accents so it round-trips with labelFor", () => {
    assert.equal(voiceSlug("Martín Vega"), "martin_vega");
    assert.equal(voiceSlug("Iñaki Muñoz"), "inaki_munoz");
  });

  test("collapses separators and trims the edges", () => {
    assert.equal(voiceSlug("  Voz   de   Prueba  "), "voz_de_prueba");
    assert.equal(voiceSlug("--hola--"), "hola");
  });

  test("refuses a name with nothing usable in it", () => {
    for (const empty of ["", "   ", "///", "..."]) {
      assert.throws(() => voiceSlug(empty), /nombre de la voz/i);
    }
  });

  test("caps the length without leaving a trailing underscore", () => {
    const slug = voiceSlug("a".repeat(200));
    assert.equal(slug.length, 64);
    assert.doesNotMatch(slug, /_$/);
  });
});

describe("assertAudioFilename", () => {
  test("accepts what LoadAudio actually lists", () => {
    for (const name of ["ref.wav", "REF.WAV", "voz.mp3", "voz.flac", "a.ogg", "b.m4a"]) {
      assert.doesNotThrow(() => assertAudioFilename(name));
    }
  });

  test("rejects anything else, including no extension at all", () => {
    for (const name of ["script.txt", "payload.exe", "sinextension"]) {
      assert.throws(() => assertAudioFilename(name), /no admitido/i);
    }
  });
});

describe("buildRegistrationWorkflow", () => {
  const graph = buildRegistrationWorkflow("martin.wav", "Hola, soy Martín.", "martin_vega", 30);

  test("wires the chain the pack's source defines", () => {
    assert.equal(graph["2"].class_type, "LoadAudio");
    assert.equal(graph["3"].class_type, "Qwen3PromptMaker");
    assert.equal(graph["4"].class_type, "Qwen3SavePrompt");
    // The audio reaches PromptMaker, and the prompt reaches SavePrompt.
    assert.deepEqual(graph["3"].inputs.ref_audio, ["2", 0]);
    assert.deepEqual(graph["3"].inputs.model, ["1", 0]);
    assert.deepEqual(graph["4"].inputs.prompt, ["3", 0]);
  });

  test("passes the transcript through untouched", () => {
    assert.equal(graph["3"].inputs.ref_text, "Hola, soy Martín.");
    assert.equal(graph["4"].inputs.filename, "martin_vega");
    assert.equal(graph["2"].inputs.audio, "martin.wav");
  });

  // THE TRIM CONTRACT (ADR-003). The transcript covers only the first N
  // seconds; if the node is allowed to listen to a different amount, the text
  // describes audio the model never heard and the voice degrades silently.
  // This is the seam that test suites normally cannot see, so it is asserted
  // here explicitly.
  test("the node's bound is the same one the transcript was made under", () => {
    for (const seconds of [10, 30, 45.5]) {
      const g = buildRegistrationWorkflow("a.wav", "texto", "voz", seconds);
      assert.equal(
        g["3"].inputs.ref_audio_max_seconds,
        seconds,
        "ref_audio_max_seconds debe ser exactamente el límite usado al transcribir",
      );
    }
  });

  test("defaults to the shared constant rather than inventing a number", async () => {
    const { REF_AUDIO_MAX_SECONDS } = await import("../src/lib/transcribe.ts");
    const g = buildRegistrationWorkflow("a.wav", "texto", "voz");
    assert.equal(g["3"].inputs.ref_audio_max_seconds, REF_AUDIO_MAX_SECONDS);
  });
});
