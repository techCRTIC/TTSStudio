import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  beginGeneration,
  generateSegment,
  MAX_SEGMENT_ATTEMPTS,
  needsSegmentation,
  redoSegment,
  replaceTrack,
  runSegmentsInOrder,
  type ScriptSegment,
  type SegmentTrack,
} from "../src/lib/long-script.ts";
import { SEGMENT_MAX_CHARS } from "../src/lib/tts.ts";

/**
 * `web/src/lib/long-script.ts` — the sequencer. Fase 3 (guiones largos).
 *
 * Every function under test here is plain async TypeScript with no React in
 * it, exercised through a `fetch` spy — same style as `status.test.ts`. No
 * real network, no real ComfyUI, no real delay: `wait: async () => {}` is
 * passed everywhere so a test that polls never actually sleeps.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | null };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const NO_WAIT = { wait: async () => {} };

/**
 * A programmable stand-in for every route this file talks to. `handlers` are
 * consulted in order for a matching URL substring; the first match answers.
 * An unmatched URL throws — which is exactly what makes "no extra call was
 * made" assertable: a stray call fails the test instead of silently 404ing.
 */
function spyFetch(handlers: { match: string; respond: (call: Call, hitCount: number) => { status?: number; body: unknown } }[]) {
  const calls: Call[] = [];
  const hits = new Map<string, number>();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
    calls.push({ url, method, body });

    for (const handler of handlers) {
      if (url.includes(handler.match)) {
        const n = (hits.get(handler.match) ?? 0) + 1;
        hits.set(handler.match, n);
        const { status = 200, body: respBody } = handler.respond({ url, method, body }, n);
        return new Response(JSON.stringify(respBody), { status });
      }
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
  return calls;
}

/** Segment `chars` from `text`. Fine for these tests: verify never runs for real. */
function seg(index: number, text: string, boundary: "sentence" | "paragraph" = "sentence"): ScriptSegment {
  return { index, text, boundary, chars: text.length };
}

describe("needsSegmentation", () => {
  test("exactly the SEGMENT_MAX_CHARS threshold, no more", () => {
    assert.equal(needsSegmentation("a".repeat(SEGMENT_MAX_CHARS)), false);
    assert.equal(needsSegmentation("a".repeat(SEGMENT_MAX_CHARS + 1)), true);
  });
});

describe("beginGeneration — the short-text guarantee", () => {
  test("a short text makes exactly the two calls page.tsx already makes today, and nothing else", async () => {
    const calls = spyFetch([
      {
        match: "/api/generate",
        respond: () => ({ body: { promptId: "P1", seed: 42, language: "Spanish", maxNewTokens: 3776 } }),
      },
      {
        match: "/api/status/",
        respond: () => ({
          body: { state: "done", audioUrl: "/api/comfy/view?filename=short.flac&subfolder=&type=output" },
        }),
      },
    ]);

    const outcome = await beginGeneration("Hola, esto es corto.", "voice-1", null, NO_WAIT);

    assert.equal(outcome.kind, "single");
    if (outcome.kind === "single") {
      assert.equal(outcome.result.filename, "short.flac");
      assert.equal(outcome.result.seed, 42);
    }

    // The hard constraint: not one call beyond generate + status.
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/api\/generate$/);
    assert.match(calls[1].url, /\/api\/status\/P1$/);
    assert.ok(
      calls.every((c) => !c.url.includes("/api/segments")),
      "a short text must never reach the segmenter",
    );
  });
});

describe("beginGeneration — the long-text path", () => {
  test("calls split exactly once and generates nothing yet", async () => {
    // Sized FROM the constant, never against a number typed in here: the
  // threshold moved from 600 to 1600 once and these fixtures silently stopped
  // describing a long text. Derived, they cannot drift again.
  const FILLER = "Frase de relleno con acentos y ñ. ";
  const longText = FILLER.repeat(Math.ceil((SEGMENT_MAX_CHARS * 2) / FILLER.length));
    assert.ok(needsSegmentation(longText));

    const calls = spyFetch([
      {
        match: "/api/segments/split",
        respond: () => ({
          body: {
            segments: [seg(0, "Primer tramo."), seg(1, "Segundo tramo.")],
            totalChars: longText.length,
          },
        }),
      },
    ]);

    const outcome = await beginGeneration(longText, "voice-1", null, NO_WAIT);

    assert.equal(outcome.kind, "split");
    if (outcome.kind === "split") {
      assert.equal(outcome.segments.length, 2);
    }
    assert.equal(calls.length, 1, "split must be called exactly once, and nothing generated before confirmation");
    assert.match(calls[0].url, /\/api\/segments\/split$/);
  });
});

describe("runSegmentsInOrder", () => {
  test("segments generate strictly in order, one at a time", async () => {
    const segments = [seg(0, "Tramo A."), seg(1, "Tramo B."), seg(2, "Tramo C.")];
    let promptCounter = 0;

    const calls = spyFetch([
      {
        match: "/api/generate",
        respond: (call) => {
          promptCounter += 1;
          const seed = (call.body?.seed as number | null) ?? 999;
          return { body: { promptId: `P${promptCounter}`, seed } };
        },
      },
      {
        match: "/api/status/",
        respond: (call) => {
          const filename = `seg-${call.url.split("/").pop()}.flac`;
          return { body: { state: "done", audioUrl: `/api/comfy/view?filename=${filename}&subfolder=&type=output` } };
        },
      },
      { match: "/api/segments/verify", respond: () => ({ body: { verdict: "ok", chars: 8, seconds: 1, charsPerSecond: 8 } }) },
    ]);

    const result = await runSegmentsInOrder(segments, "voice-1", 100, NO_WAIT);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.tracks.map((t) => t.index), [0, 1, 2]);
      assert.ok(result.tracks.every((t) => t.status === "done"));
    }

    // 3 calls per segment (generate, status, verify) × 3 segments, and the
    // generate call for a LATER segment never appears before the EARLIER
    // segment's own verify call — i.e. strictly sequential, never parallel.
    const kinds = calls.map((c) =>
      c.url.includes("/api/generate") ? "generate" : c.url.includes("/api/status") ? "status" : "verify",
    );
    assert.deepEqual(kinds, [
      "generate", "status", "verify",
      "generate", "status", "verify",
      "generate", "status", "verify",
    ]);
  });
});

describe("generateSegment — the loop-bug retry gate", () => {
  test("a 'loop' verdict regenerates with a DIFFERENT seed, and keeps the second take", async () => {
    const segment = seg(0, "Un tramo cualquiera.");
    const seedsUsed: number[] = [];

    spyFetch([
      {
        match: "/api/generate",
        respond: (call) => {
          const seed = call.body?.seed as number;
          seedsUsed.push(seed);
          return { body: { promptId: `P${seedsUsed.length}`, seed } };
        },
      },
      {
        match: "/api/status/",
        respond: (call) => ({
          body: {
            state: "done",
            audioUrl: `/api/comfy/view?filename=take-${call.url.split("/").pop()}.flac&subfolder=&type=output`,
          },
        }),
      },
      {
        match: "/api/segments/verify",
        respond: (_call, hit) => ({
          body: { verdict: hit === 1 ? "loop" : "ok", chars: 20, seconds: 3, charsPerSecond: 6.6 },
        }),
      },
    ]);

    const { ok, track } = await generateSegment(segment, "voice-1", 111, NO_WAIT);

    assert.equal(ok, true);
    assert.equal(track.status, "redone");
    assert.equal(track.attempts, 2);
    assert.equal(seedsUsed.length, 2);
    assert.equal(seedsUsed[0], 111, "the FIRST attempt uses the base seed");
    assert.notEqual(seedsUsed[1], seedsUsed[0], "the retry must use a different seed");
    assert.equal(track.seed, seedsUsed[1], "the track records the seed that actually produced the kept take");
  });

  test("exhausting every attempt stops the script and names the culprit — never a silent bad take", async () => {
    const segments = [seg(0, "Tramo malo."), seg(1, "Tramo bueno.")];
    let generateCalls = 0;

    spyFetch([
      {
        match: "/api/generate",
        respond: (call) => {
          generateCalls += 1;
          return { body: { promptId: `P${generateCalls}`, seed: call.body?.seed as number } };
        },
      },
      {
        match: "/api/status/",
        respond: () => ({
          body: { state: "done", audioUrl: "/api/comfy/view?filename=bad.flac&subfolder=&type=output" },
        }),
      },
      // Every verify comes back 'cut' — this segment can never pass.
      { match: "/api/segments/verify", respond: () => ({ body: { verdict: "cut", chars: 5, seconds: 0.2, charsPerSecond: 25 } }) },
    ]);

    const result = await runSegmentsInOrder(segments, "voice-1", 1, NO_WAIT);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedIndex, 0, "the FIRST (only bad) segment is the one named");
      assert.match(result.error, /tramo 1/, "the error must name which segment, not just say 'failed'");
      assert.equal(result.tracks.length, 1, "the script stops — segment 2 is never attempted");
      assert.equal(result.tracks[0].status, "failed");
    }
    // Exactly MAX_SEGMENT_ATTEMPTS generate calls: the retry ceiling is respected,
    // and nothing from segment 2 (which would need a 4th+ call) ever ran.
    assert.equal(generateCalls, MAX_SEGMENT_ATTEMPTS);
  });
});

describe("redoSegment — rehacer un tramo suelto", () => {
  test("sends exactly one generation call, independent of any other segment", async () => {
    const segment = seg(3, "El tramo que el usuario quiere rehacer.");

    const calls = spyFetch([
      { match: "/api/generate", respond: (call) => ({ body: { promptId: "P-redo", seed: call.body?.seed as number } }) },
      {
        match: "/api/status/",
        respond: () => ({
          body: { state: "done", audioUrl: "/api/comfy/view?filename=redone.flac&subfolder=&type=output" },
        }),
      },
      { match: "/api/segments/verify", respond: () => ({ body: { verdict: "ok", chars: 40, seconds: 4, charsPerSecond: 10 } }) },
    ]);

    const track = await redoSegment(segment, "voice-1", 777, NO_WAIT);

    assert.equal(track.index, 3, "the redone track keeps the ORIGINAL segment's position");
    assert.equal(track.status, "redone");
    assert.equal(track.seed, 777);

    const generateCalls = calls.filter((c) => c.url.includes("/api/generate"));
    assert.equal(generateCalls.length, 1, "redo must send exactly one generation — never a retry loop");
    assert.equal(calls.length, 3, "generate + one status poll + one verify, nothing more");
  });
});

describe("replaceTrack — rehacer uno no puede tocar a los demás", () => {
  /**
   * The other half of the redo promise. `redoSegment` proves the cost (exactly
   * one generation); this proves the blast radius (zero). They are separate
   * functions because the first cannot see siblings — so asserting "the others
   * are identical" over there was impossible, and QA was right to call it.
   *
   * The fixture below is built from `SegmentTrack`'s REAL fields with no cast.
   * A first draft invented a nested `audio` object and forced it through
   * `as unknown as SegmentTrack`; the filename assertion then compared
   * `undefined` to `undefined` and passed while proving nothing. A fixture that
   * needs a cast to typecheck is a fixture that is no longer describing the
   * thing under test.
   */
  function track(index: number, filename: string, seed: number): SegmentTrack {
    return {
      index,
      text: `tramo ${index}`,
      boundary: "sentence",
      chars: 100,
      status: "done",
      seed,
      attempts: 1,
      filename,
      subfolder: "",
      type: "output",
      audioUrl: `/api/comfy/view?filename=${filename}`,
    };
  }

  test("los tramos vecinos vuelven como LOS MISMOS OBJETOS", () => {
    const before = [track(0, "a.flac", 11), track(1, "b.flac", 22), track(2, "c.flac", 33)];
    const redone: SegmentTrack = {
      ...before[1],
      status: "redone",
      seed: 999,
      filename: "b2.flac",
      audioUrl: "/api/comfy/view?filename=b2.flac",
    };

    const after = replaceTrack(before, redone);

    // Identity, not deep equality: a copy that happens to match today can
    // silently start differing tomorrow. Same reference cannot.
    assert.equal(after[0], before[0], "el tramo 0 debe ser el mismo objeto");
    assert.equal(after[2], before[2], "el tramo 2 debe ser el mismo objeto");
    assert.equal(after[1], redone, "solo el rehecho cambia");
  });

  test("el orden se conserva y el arreglo de entrada no se muta", () => {
    const before = [track(0, "a.flac", 11), track(1, "b.flac", 22), track(2, "c.flac", 33)];
    const snapshot = before.slice();
    const redone: SegmentTrack = { ...before[0], seed: 777 };

    const after = replaceTrack(before, redone);

    assert.deepEqual(after.map((t) => t.index), [0, 1, 2], "los tramos siguen en orden");
    assert.deepEqual(before, snapshot, "el arreglo original no se toca");
  });

  test("ni el archivo ni la semilla de los vecinos cambian", () => {
    const before = [track(0, "a.flac", 11), track(1, "b.flac", 22), track(2, "c.flac", 33)];
    const redone: SegmentTrack = {
      ...before[1],
      seed: 999,
      filename: "b2.flac",
      audioUrl: "/api/comfy/view?filename=b2.flac",
    };

    const after = replaceTrack(before, redone);

    for (const index of [0, 2]) {
      const antes = before.find((t) => t.index === index)!;
      const despues = after.find((t) => t.index === index)!;
      assert.equal(despues.seed, antes.seed, `la semilla del tramo ${index} cambió`);
      assert.equal(despues.filename, antes.filename, `el archivo del tramo ${index} cambió`);
      assert.equal(despues.audioUrl, antes.audioUrl, `la URL del tramo ${index} cambió`);
    }
  });
});

describe("runSegmentsInOrder — detener a mitad", () => {
  // Añadido el 2026-08-24. Antes de esta fecha no había forma de parar: el
  // hook solo ofrecía reset(), que vacía la pantalla mientras el bucle sigue
  // llamando al motor. Con 28 tramos en marcha eso significaba esperar a que
  // terminara todo.
  const engineOk = [
    {
      match: "/api/generate",
      respond: (call: { body?: Record<string, unknown> | null }) => ({
        body: { promptId: "P", seed: (call.body?.seed as number | null) ?? 999 },
      }),
    },
    {
      match: "/api/status/",
      respond: () => ({
        body: { state: "done", audioUrl: "/api/comfy/view?filename=x.flac&subfolder=&type=output" },
      }),
    },
    {
      match: "/api/segments/verify",
      respond: () => ({ body: { verdict: "ok", chars: 8, seconds: 1, charsPerSecond: 8 } }),
    },
  ];

  test("para tras el tramo en curso y devuelve los que ya estaban hechos", async () => {
    const segments = [seg(0, "Tramo A."), seg(1, "Tramo B."), seg(2, "Tramo C."), seg(3, "Tramo D.")];
    spyFetch(engineOk);

    let hechos = 0;
    const result = await runSegmentsInOrder(
      segments,
      "voice-1",
      100,
      NO_WAIT,
      (track) => {
        if (track.status === "done" || track.status === "redone") hechos += 1;
      },
      // Pide parar en cuanto haya DOS tramos terminados.
      () => hechos >= 2,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.stopped, true, "una parada pedida no es un fallo");
      assert.equal(result.tracks.length, 2, "conserva exactamente lo ya generado");
      assert.deepEqual(result.tracks.map((t) => t.index), [0, 1]);
      assert.ok(result.tracks.every((t) => t.filename !== null), "los tramos hechos traen su audio");
      assert.equal(result.failedIndex, 2, "señala dónde se quedó");
    }
  });

  test("no se pide parar: la corrida llega hasta el final", async () => {
    const segments = [seg(0, "Tramo A."), seg(1, "Tramo B.")];
    spyFetch(engineOk);

    const result = await runSegmentsInOrder(segments, "voice-1", 100, NO_WAIT, undefined, () => false);

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.tracks.length, 2);
  });

  test("parar ANTES del primer tramo no genera nada", async () => {
    const segments = [seg(0, "Tramo A."), seg(1, "Tramo B.")];
    const calls = spyFetch(engineOk);

    const result = await runSegmentsInOrder(segments, "voice-1", 100, NO_WAIT, undefined, () => true);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.stopped, true);
      assert.equal(result.tracks.length, 0);
    }
    assert.equal(calls.length, 0, "no se llamó al motor ni una vez");
  });
});
