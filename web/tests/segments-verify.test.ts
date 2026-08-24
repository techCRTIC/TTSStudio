import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * POST /api/segments/verify — Fase 3 (guiones largos).
 *
 * Same `@/` resolve-hook trick as `takes.test.ts`, for the same reason: a
 * route handler imports through the path alias, which Node's own ESM loader
 * does not resolve.
 *
 * This suite runs against the REAL `execution/tts_unir_tramos.py` (a spawned
 * subprocess, not a mock) — it exercises the whole seam: spawn, argument
 * passing, `soundfile` reading the WAV fixtures below, JSON parsing, exit
 * codes. Before that script existed in this session, the same suite ran
 * green against a throwaway, never-committed fixture standing in for it,
 * which is how the route's request/response shapes were proven out.
 */

const SRC_ROOT = pathToFileURL(path.join(import.meta.dirname, "..", "src") + "/").href;

const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL(specifier.slice(2) + ".ts", ${JSON.stringify(SRC_ROOT)}).href;
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

let POST: (request: Request) => Promise<Response>;
let outputDir: string;

/** A minimal, real, readable 16-bit PCM mono WAV — silence, but a real file. */
async function makeWav(name: string, seconds: number, sampleRate = 24000): Promise<void> {
  const numSamples = Math.round(seconds * sampleRate);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  await writeFile(path.join(outputDir, name), buffer);
}

before(async () => {
  const comfyRoot = await mkdtemp(path.join(tmpdir(), "ttsstudio-verify-test-"));
  outputDir = path.join(comfyRoot, "output");
  await mkdir(outputDir, { recursive: true });
  process.env.COMFY_ROOT = comfyRoot;

  ({ POST } = await import("../src/app/api/segments/verify/route.ts"));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/segments/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/segments/verify", () => {
  test("a healthy segment (cps inside the band) verifies as ok", async () => {
    // 40 chars over 4s = 10 c/s, inside [8, 22], and comfortably above any
    // reasonable minimum-length gate.
    await makeWav("healthy.wav", 4);
    const res = await POST(req({ filename: "healthy.wav", chars: 40 }));
    const body = (await res.json()) as { verdict: string; charsPerSecond: number };

    assert.equal(res.status, 200);
    assert.equal(body.verdict, "ok");
    assert.ok(Math.abs(body.charsPerSecond - 10) < 0.01);
  });

  test("the loop-bug shape (way too many chars/second) verifies as a rejection, not a crash", async () => {
    // 100 chars over 0.5s = 200 c/s, far past the 22 c/s ceiling — "cut" (too
    // fast), the mirror of "loop" (too slow). Either way: a verdict, HTTP 200.
    await makeWav("looped.wav", 0.5);
    const res = await POST(req({ filename: "looped.wav", chars: 100 }));
    const body = (await res.json()) as { verdict: string };

    // A rejection is a normal verdict, not a transport failure — same
    // convention as /api/text/review's blocking findings.
    assert.equal(res.status, 200);
    assert.equal(body.verdict, "cut");
  });

  test("a segment below the length gate gets 'sin_veredicto', never a c/s verdict", async () => {
    // 10 chars over 0.1s = 100 c/s — would fail the band, but is short enough
    // the gate exempts it (fixture-only threshold; see the fixture's docstring).
    await makeWav("tiny.wav", 0.1);
    const res = await POST(req({ filename: "tiny.wav", chars: 10 }));
    const body = (await res.json()) as { verdict: string };

    assert.equal(res.status, 200);
    assert.equal(body.verdict, "sin_veredicto");
  });

  test("400s with missing_segment when there is no filename", async () => {
    const res = await POST(req({ chars: 20 }));
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 400);
    assert.equal(body.error, "missing_segment");
  });

  test("400s with missing_chars when chars is absent or not positive", async () => {
    await makeWav("no-chars.wav", 1);
    for (const bad of [undefined, 0, -5, "20"]) {
      const payload: Record<string, unknown> = { filename: "no-chars.wav" };
      if (bad !== undefined) payload.chars = bad;
      const res = await POST(req(payload));
      const body = (await res.json()) as { error: string };
      assert.equal(res.status, 400, `chars=${JSON.stringify(bad)} should 400`);
      assert.equal(body.error, "missing_chars");
    }
  });

  test("a traversal attempt is rejected with 400 before the script ever runs", async () => {
    const res = await POST(req({ filename: "../../evil.wav", chars: 20 }));
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_segment");
  });
});
