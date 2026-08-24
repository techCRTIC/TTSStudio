import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * POST /api/segments/join — Fase 3 (guiones largos).
 *
 * Same `@/` resolve-hook as `takes.test.ts` / `segments-verify.test.ts`.
 *
 * Runs against the REAL `execution/tts_unir_tramos.py` — see the note at the
 * top of `segments-verify.test.ts` for how it was proven out before that
 * script existed in this session.
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
  const comfyRoot = await mkdtemp(path.join(tmpdir(), "ttsstudio-join-test-"));
  outputDir = path.join(comfyRoot, "output");
  await mkdir(outputDir, { recursive: true });
  process.env.COMFY_ROOT = comfyRoot;

  ({ POST } = await import("../src/app/api/segments/join/route.ts"));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/segments/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/segments/join", () => {
  test("joins two healthy same-rate segments into one piece", async () => {
    await makeWav("part-a.wav", 1, 24000);
    await makeWav("part-b.wav", 1, 24000);

    const res = await POST(
      req({
        segments: [
          { filename: "part-a.wav", boundary: "sentence" },
          { filename: "part-b.wav", boundary: "paragraph" },
        ],
      }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      filename: string;
      audioUrl: string;
      seconds: number;
      sampleRate: number;
      segments: number;
    };

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.segments, 2);
    assert.equal(body.sampleRate, 24000);
    // ~1s + ~1s + a short pause between them, well short of 2 paragraph pauses.
    assert.ok(body.seconds > 2 && body.seconds < 2.5, `unexpected duration ${body.seconds}`);
    assert.match(body.filename, /^ttsstudio_pieza_.+\.flac$/);
    assert.match(
      body.audioUrl,
      new RegExp(`^/api/comfy/view\\?filename=${encodeURIComponent(body.filename)}&subfolder=&type=output$`),
    );

    // The audioUrl proxies straight through the existing ComfyUI view route
    // (ADR-001/statusOf's own pattern) — no new playback/download path needed.
    const written = await stat(path.join(outputDir, body.filename));
    assert.ok(written.isFile());
  });

  test("mismatched sample rates surface as a readable 502, not a silent bad file", async () => {
    // `unir()` RAISES FrecuenciasDistintasError for this rather than
    // returning a verdict — see the route's docstring — so this is the one
    // join failure mode that is NOT a 400: the paths were all valid, the
    // rejection only shows up once Python actually reads the headers.
    await makeWav("rate-a.wav", 1, 24000);
    await makeWav("rate-b.wav", 1, 44100);

    const before = await readdir(outputDir);

    const res = await POST(
      req({
        segments: [
          { filename: "rate-a.wav", boundary: "sentence" },
          { filename: "rate-b.wav", boundary: "sentence" },
        ],
      }),
    );
    const body = (await res.json()) as { error: string; message: string };

    assert.equal(res.status, 502);
    assert.equal(body.error, "join_failed");
    // The exception's own message, not a generic string — proof the real
    // reason (not just "it failed") reaches the caller.
    assert.match(body.message, /24000/);
    assert.match(body.message, /44100/);

    // Nothing extra should have been written when the join was refused.
    const after = await readdir(outputDir);
    assert.deepEqual(after, before);
  });

  test("a list longer than the cap is refused before any work starts", async () => {
    // The timeout scales with the segment count and the joiner decodes every
    // segment into memory, so an unbounded list is an unbounded ask. The cap
    // must reject the request outright rather than resolving 201 paths first.
    await makeWav("cap.wav", 1, 24000);
    const segments = Array.from({ length: 201 }, () => ({
      filename: "cap.wav",
      boundary: "sentence",
    }));
    const res = await POST(req({ segments }));
    const body = (await res.json()) as { error: string };

    assert.equal(res.status, 400);
    assert.equal(body.error, "too_many_segments");
  });

  test("400s with missing_segments on an empty or absent list", async () => {
    for (const payload of [{}, { segments: [] }]) {
      const res = await POST(req(payload));
      const body = (await res.json()) as { error: string };
      assert.equal(res.status, 400);
      assert.equal(body.error, "missing_segments");
    }
  });

  test("a segment missing its boundary invalidates the whole request", async () => {
    await makeWav("ok-a.wav", 1);
    const res = await POST(
      req({ segments: [{ filename: "ok-a.wav" }] }),
    );
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_segment");
  });

  test("one bad path rejects the ENTIRE request — nothing gets joined or dropped silently", async () => {
    await makeWav("good-1.wav", 1);
    await makeWav("good-2.wav", 1);
    const before = await readdir(outputDir);

    const res = await POST(
      req({
        segments: [
          { filename: "good-1.wav", boundary: "sentence" },
          { filename: "../../evil.wav", boundary: "sentence" },
          { filename: "good-2.wav", boundary: "paragraph" },
        ],
      }),
    );
    const body = (await res.json()) as { error: string; message: string };

    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_segment");
    assert.match(body.message, /tramo 2/);

    // No piece was written — the request was rejected before touching Python.
    const after = await readdir(outputDir);
    assert.deepEqual(after, before);
  });
});
