import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * POST /api/segments/split — Fase 3 (guiones largos).
 *
 * Same `@/` resolve-hook trick as the other route suites, for the same reason:
 * a route handler imports through the path alias, which Node's own ESM loader
 * does not resolve.
 *
 * This suite runs the REAL segmenter through the REAL bridge — no fixture, no
 * stub. That is deliberate: the two things most likely to break here are the
 * stdin plumbing and the encoding across it, and neither exists in a stub. It
 * needs the project venv (`uv sync`), like the transcription suite does.
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
let SEGMENT_MAX_CHARS: number;

before(async () => {
  ({ POST } = await import("../src/app/api/segments/split/route.ts"));
  ({ SEGMENT_MAX_CHARS } = await import("../src/lib/tts.ts"));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/segments/split", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type SplitBody = {
  segments: { index: number; text: string; boundary: string; chars: number }[];
  totalChars: number;
};

describe("POST /api/segments/split", () => {
  test("a multi-paragraph script comes back cut on sentence boundaries", async () => {
    const script = [
      "Primera frase del primer párrafo. Segunda frase, con una coma.",
      "",
      "El segundo párrafo empieza aquí. Y termina así.",
    ].join("\n");

    const res = await POST(req({ text: script }));
    const body = (await res.json()) as SplitBody;

    assert.equal(res.status, 200);
    assert.ok(body.segments.length >= 1);
    for (const segment of body.segments) {
      assert.ok(segment.chars <= SEGMENT_MAX_CHARS, "no segment may exceed the threshold");
      assert.ok(
        segment.boundary === "sentence" || segment.boundary === "paragraph",
        `unexpected boundary: ${segment.boundary}`,
      );
    }
    // Positions are what the sequencer orders and regenerates by, so they must
    // be dense and ascending from zero, not merely present.
    assert.deepEqual(
      body.segments.map((s) => s.index),
      body.segments.map((_, i) => i),
    );
  });

  test("accents survive the pipe — this is the text a voice will say out loud", async () => {
    // The bridge writes UTF-8 into stdin and Python must read it as UTF-8. Get
    // this wrong and "más" becomes another word, the stress lands on the wrong
    // syllable, and the cloned voice sounds foreign (the finding behind
    // ADR-006). It fails silently everywhere else, so it is asserted here.
    const script = "El niño comió más pan aquí, según él. ¿Y qué pasó después?";

    const res = await POST(req({ text: script }));
    const body = (await res.json()) as SplitBody;

    assert.equal(res.status, 200);
    const joined = body.segments.map((s) => s.text).join(" ");
    for (const character of "ñáéíóú¿") {
      assert.ok(joined.includes(character), `lost ${character} crossing the bridge`);
    }
  });

  test("a script far past the command-line ceiling still goes through", async () => {
    // The reason the text travels over stdin at all: a Windows command line
    // stops at 32.767 characters, and a long narration is in that range. As an
    // argument this would fail to spawn; as a pipe it must simply work.
    const sentence = "Esta es una frase de relleno con acentos y ñ. ";
    const script = sentence.repeat(1200); // ~54.000 chars

    assert.ok(script.length > 32_767, "the fixture must actually exceed the ceiling");

    const res = await POST(req({ text: script }));
    const body = (await res.json()) as SplitBody;

    assert.equal(res.status, 200);
    // Derived from the threshold, not a number typed in: how many segments
    // 54.000 characters becomes depends entirely on where the threshold sits,
    // and it has already moved once.
    assert.ok(
      body.segments.length >= Math.floor(script.length / SEGMENT_MAX_CHARS),
      `${script.length} caracteres deberían dar al menos ${Math.floor(script.length / SEGMENT_MAX_CHARS)} tramos`,
    );
    for (const segment of body.segments) {
      assert.ok(segment.chars <= SEGMENT_MAX_CHARS);
    }
  });

  test("400s on empty or whitespace-only text, without spawning anything", async () => {
    for (const text of ["", "   \n  "]) {
      const res = await POST(req({ text }));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "empty_text");
    }
  });

  test("400s on a script past the size ceiling", async () => {
    const res = await POST(req({ text: "a".repeat(100_001) }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "text_too_long");
  });

  test("a body with no text at all is a 400, not a crash", async () => {
    const res = await POST(req({ nothing: true }));
    assert.equal(res.status, 400);
  });
});
