import { test, describe, before, afterEach } from "node:test";
import assert from "node:assert/strict";

/**
 * `web/src/lib/history.ts` — Fase 3 (guiones largos): composite (long-script)
 * takes.
 *
 * `history.ts` is a browser module: `read()`/`commit()` call
 * `window.localStorage` directly, never `globalThis.localStorage`. A tiny
 * in-memory `Storage` stands in for it below — not jsdom, just enough of the
 * interface these functions actually call — installed BEFORE the module is
 * imported, since `useHistory`'s lazy `cache` is populated from it on first
 * read.
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const KEY = "ttsstudio.history.v1";
const storage = new MemoryStorage();
(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
  localStorage: storage,
};

let addTake: typeof import("../src/lib/history.ts").addTake;
let deleteTake: typeof import("../src/lib/history.ts").deleteTake;
let filesForTake: typeof import("../src/lib/history.ts").filesForTake;
type Take = import("../src/lib/history.ts").Take;

before(async () => {
  ({ addTake, deleteTake, filesForTake } = await import("../src/lib/history.ts"));
});

function readRaw(): Take[] {
  const raw = storage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Take[]) : [];
}

// This describe block runs FIRST and deliberately seeds storage before the
// module's internal `cache` has ever been populated by any other test in
// this file — it is what proves a pre-existing, old-shaped record actually
// gets read off disk, not just accepted because it was never re-read.
describe("Take — reading an old, pre-Fase-3 record", () => {
  test("a take with no `segments` field still round-trips through addTake", () => {
    const oldTake = {
      id: "old-1",
      text: "Toma antigua, de antes de que existieran los tramos.",
      voiceId: "v1",
      voiceLabel: "Voz 1",
      seed: 5,
      audioUrl: "/api/comfy/view?filename=old.flac&subfolder=&type=output",
      filename: "old.flac",
      createdAt: 1000,
      // No `good`, no `segments` — exactly the shape written before Fase 3.
    };
    storage.setItem(KEY, JSON.stringify([oldTake]));

    const newTake: Take = {
      id: "new-1",
      text: "Toma nueva",
      voiceId: "v1",
      voiceLabel: "Voz 1",
      seed: 6,
      audioUrl: "/api/comfy/view?filename=new.flac&subfolder=&type=output",
      filename: "new.flac",
      createdAt: 2000,
    };
    addTake(newTake);

    const raw = readRaw();
    const found = raw.find((t) => t.id === "old-1");
    assert.ok(found, "the old take must still be there, unharmed by the write that just happened");
    assert.equal(found?.segments, undefined, "an old take's absence of `segments` must not be invented");
    assert.ok(raw.some((t) => t.id === "new-1"), "the new take was added alongside it");

    // The absence must read as "predates the concept", never as a crash and
    // never as "this take has zero segments" (a different, real state).
    const files = filesForTake(found as Take);
    assert.deepEqual(files, [{ filename: "old.flac", subfolder: "", type: "output" }]);
  });
});

describe("deleteTake — composite vs. normal", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a composite (long-script) take deletes in ONE batched request carrying N+1 files", async () => {
    const composite: Take = {
      id: "composite-1",
      text: "Guión largo trozado en tres tramos, unidos en una pieza.",
      voiceId: "v1",
      voiceLabel: "Voz 1",
      seed: 10,
      audioUrl: "/api/comfy/view?filename=joined.flac&subfolder=&type=output",
      filename: "joined.flac",
      createdAt: 3000,
      segments: [
        { index: 0, filename: "seg-0.flac", boundary: "sentence", seed: 10 },
        { index: 1, filename: "seg-1.flac", boundary: "sentence", seed: 55 },
        { index: 2, filename: "seg-2.flac", boundary: "paragraph", seed: 10 },
      ],
    };
    addTake(composite);

    let requestCount = 0;
    let sentFiles: { filename: string }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestCount += 1;
      const url = String(input instanceof Request ? input.url : input);
      assert.match(url, /\/api\/takes$/, "the batch path hits the very same route, no new endpoint");
      assert.equal(init?.method, "DELETE");
      assert.equal(
        (init?.headers as Record<string, string> | undefined)?.["content-type"],
        "application/json",
        "the JSON content-type is what discriminates batch from single on the server",
      );
      const parsed = JSON.parse(String(init?.body)) as { files: { filename: string }[] };
      sentFiles = parsed.files;
      const results = parsed.files.map((f, i) => ({ index: i, filename: f.filename, subfolder: "", deleted: true }));
      return new Response(JSON.stringify({ results }), { status: 200 });
    }) as typeof fetch;

    await deleteTake(composite);

    assert.equal(requestCount, 1, "exactly one HTTP request for the whole composite take");
    assert.equal(sentFiles.length, 4, "N segments (3) + the joined piece = N+1 = 4");
    assert.deepEqual(
      sentFiles.map((f) => f.filename),
      ["seg-0.flac", "seg-1.flac", "seg-2.flac", "joined.flac"],
    );

    assert.equal(
      readRaw().some((t) => t.id === "composite-1"),
      false,
      "the entry is removed once every file on disk deleted successfully",
    );
  });

  test("a partial batch failure keeps the entry and names which files survived", async () => {
    const composite: Take = {
      id: "composite-2",
      text: "Otro guión largo, este con un tramo que no se pudo borrar.",
      voiceId: "v1",
      voiceLabel: "Voz 1",
      seed: 20,
      audioUrl: "/api/comfy/view?filename=joined-2.flac&subfolder=&type=output",
      filename: "joined-2.flac",
      createdAt: 3500,
      segments: [{ index: 0, filename: "seg-x.flac", boundary: "sentence", seed: 20 }],
    };
    addTake(composite);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { index: 0, filename: "seg-x.flac", subfolder: "", deleted: false, error: "permission denied" },
            { index: 1, filename: "joined-2.flac", subfolder: "", deleted: true },
          ],
        }),
        { status: 207 },
      )) as typeof fetch;

    await assert.rejects(() => deleteTake(composite), /seg-x\.flac/);

    assert.ok(
      readRaw().some((t) => t.id === "composite-2"),
      "a partial failure must not drop the entry — that would orphan whatever DID delete",
    );
  });

  test("a normal take (no segments) still deletes via the single-file query-param path, unchanged", async () => {
    const normal: Take = {
      id: "normal-1",
      text: "Toma normal, de una sola pieza.",
      voiceId: "v1",
      voiceLabel: "Voz 1",
      seed: 1,
      audioUrl: "/api/comfy/view?filename=normal.flac&subfolder=&type=output",
      filename: "normal.flac",
      createdAt: 4000,
    };
    addTake(normal);

    let requestCount = 0;
    let calledWithQueryParams = false;
    let calledWithJsonBody = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestCount += 1;
      const url = String(input instanceof Request ? input.url : input);
      calledWithQueryParams = url.includes("filename=normal.flac");
      calledWithJsonBody = typeof init?.body === "string";
      return new Response(JSON.stringify({ deleted: "normal.flac" }), { status: 200 });
    }) as typeof fetch;

    await deleteTake(normal);

    assert.equal(requestCount, 1);
    assert.equal(calledWithQueryParams, true, "a normal take must still use query params, exactly as before");
    assert.equal(calledWithJsonBody, false, "and never a JSON body — that would be the batch path");
    assert.equal(readRaw().some((t) => t.id === "normal-1"), false);
  });
});
