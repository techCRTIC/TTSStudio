import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * DELETE /api/takes — both shapes.
 *
 * The route imports its dependency via the `@/` path alias, which Node's
 * built-in ESM loader does not resolve on its own (confirmed: importing
 * `route.ts` directly throws `ERR_MODULE_NOT_FOUND` for `@/lib/comfy-files`).
 * The other files in this suite sidestep that by importing pure modules
 * through relative paths instead. A route handler can't be exercised that
 * way without duplicating its logic, so this file registers a tiny,
 * self-contained resolve hook — scoped to this process only, nothing shared
 * or written to package.json/tsconfig — that rewrites `@/x` to
 * `../src/x.ts` before the route module is imported.
 *
 * `COMFY_ROOT` is pointed at a scratch temp directory (set before the first
 * import of `comfy-files.ts`, since it reads the env var once at module
 * load) so these tests never touch a real ComfyUI install.
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

let DELETE: (request: Request) => Promise<Response>;
let outputDir: string;

before(async () => {
  const comfyRoot = await mkdtemp(path.join(tmpdir(), "ttsstudio-takes-test-"));
  outputDir = path.join(comfyRoot, "output");
  await mkdir(outputDir, { recursive: true });
  process.env.COMFY_ROOT = comfyRoot;

  ({ DELETE } = await import("../src/app/api/takes/route.ts"));
});

/** A real, deletable file inside the scratch output directory. */
async function makeFile(name: string): Promise<void> {
  await writeFile(path.join(outputDir, name), "not really audio");
}

async function exists(name: string): Promise<boolean> {
  try {
    await stat(path.join(outputDir, name));
    return true;
  } catch {
    return false;
  }
}

describe("DELETE /api/takes — single file (unchanged contract)", () => {
  test("deletes the file and replies { deleted: filename }, same as before", async () => {
    await makeFile("single-ok.flac");
    const req = new Request("http://localhost/api/takes?filename=single-ok.flac", { method: "DELETE" });

    const res = await DELETE(req);
    const body = (await res.json()) as { deleted: string };

    assert.equal(res.status, 200);
    assert.deepEqual(body, { deleted: "single-ok.flac" });
    assert.equal(await exists("single-ok.flac"), false);
  });

  test("400s with missing_filename when no filename is given", async () => {
    const req = new Request("http://localhost/api/takes", { method: "DELETE" });
    const res = await DELETE(req);
    const body = (await res.json()) as { error: string };

    assert.equal(res.status, 400);
    assert.equal(body.error, "missing_filename");
  });

  test("a traversal attempt is rejected with 400, not attempted", async () => {
    const req = new Request(
      `http://localhost/api/takes?${new URLSearchParams({ filename: "../../evil.flac" })}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    assert.equal(res.status, 400);
  });
});

describe("DELETE /api/takes — batch (the widened contract)", () => {
  test("rejects a body with no files array", async () => {
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as { error: string };

    assert.equal(res.status, 400);
    assert.equal(body.error, "missing_files");
  });

  test("rejects an empty files array", async () => {
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [] }),
    });
    const res = await DELETE(req);
    assert.equal(res.status, 400);
  });

  test("full success: every segment deleted, status 200, all results deleted:true", async () => {
    await makeFile("seg-a1.flac");
    await makeFile("seg-a2.flac");
    await makeFile("joined-a.flac");

    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ filename: "seg-a1.flac" }, { filename: "seg-a2.flac" }, { filename: "joined-a.flac" }],
      }),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as {
      results: { filename: string; deleted: boolean }[];
    };

    assert.equal(res.status, 200);
    assert.equal(body.results.length, 3);
    assert.ok(body.results.every((r) => r.deleted === true));
    for (const name of ["seg-a1.flac", "seg-a2.flac", "joined-a.flac"]) {
      assert.equal(await exists(name), false);
    }
  });

  test("partial failure is visible per file, not swallowed — status 207", async () => {
    // Three real, deletable files…
    await makeFile("seg-b1.flac");
    await makeFile("seg-b2.flac");
    await makeFile("seg-b3.flac");
    // …one entry that fails PATH VALIDATION (never reaches deleteFile at all)…
    // …and one entry that resolves fine but fails ACTUAL DELETION: a directory
    // in the file's place makes unlink() genuinely fail, which is the same
    // family of real-world failure the docstring calls out (permissions/in use).
    await mkdir(path.join(outputDir, "seg-b4.flac"));

    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          { filename: "bad-type.flac", type: "temp" }, // validation-phase failure, listed FIRST on purpose
          { filename: "seg-b1.flac" },
          { filename: "seg-b2.flac" },
          { filename: "seg-b3.flac" },
          { filename: "seg-b4.flac" }, // deletion-phase failure
        ],
      }),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as {
      results: { filename: string; deleted: boolean; error?: string }[];
    };

    assert.equal(res.status, 207, "a partial failure must not be reported as a plain 200");
    assert.equal(body.results.length, 5);

    const byName = new Map(body.results.map((r) => [r.filename, r]));

    // The invalid entry at the front did NOT abort the batch: the three good
    // files after it still deleted, proving validation-phase and
    // deletion-phase failures are per-item, not batch-fatal.
    assert.equal(byName.get("bad-type.flac")?.deleted, false);
    assert.ok(typeof byName.get("bad-type.flac")?.error === "string" && byName.get("bad-type.flac")!.error!.length > 0);

    for (const name of ["seg-b1.flac", "seg-b2.flac", "seg-b3.flac"]) {
      assert.equal(byName.get(name)?.deleted, true, `${name} should have deleted`);
      assert.equal(await exists(name), false, `${name} should be gone from disk`);
    }

    assert.equal(byName.get("seg-b4.flac")?.deleted, false);
    assert.ok(
      typeof byName.get("seg-b4.flac")?.error === "string" && byName.get("seg-b4.flac")!.error!.length > 0,
    );
    // The failed deletion must NOT have removed anything — a failure that is
    // reported must also be a failure that is real.
    assert.equal(await exists("seg-b4.flac"), true, "the directory standing in for seg-b4 must survive");
  });

  test("the batch validates traversal exactly like the single-file path does", async () => {
    // The single-file path already has this test. Without the same anchor on
    // the batch, a future refactor could resolve batch paths some other way
    // and nothing would go red — the batch is the path that deletes N files
    // at once, so it is the one that can do the most damage.
    await makeFile("seg-t1.flac");
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ filename: "../../../evil.flac" }, { filename: "seg-t1.flac" }],
      }),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as {
      results: { index: number; filename: string; deleted: boolean; error?: string }[];
    };

    assert.equal(res.status, 207);
    assert.equal(body.results[0].deleted, false, "a traversal must never be deleted");
    assert.ok(typeof body.results[0].error === "string" && body.results[0].error.length > 0);
    // And the batch was not taken down by it: the legitimate neighbour still went.
    assert.equal(body.results[1].deleted, true);
    assert.equal(await exists("seg-t1.flac"), false);
  });

  test("every result carries its request position, so same-named files stay distinguishable", async () => {
    // Two segments of one long take can share a filename in different
    // subfolders. Keyed by filename alone they collapse into one, and the
    // caller would read "deleted" for a file still on disk.
    await makeFile("seg-d1.flac");
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          { filename: "seg-d1.flac" },
          { filename: "seg-d1.flac", subfolder: "no-existe" },
        ],
      }),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as {
      results: { index: number; filename: string; subfolder: string; deleted: boolean }[];
    };

    assert.equal(body.results.length, 2);
    assert.deepEqual(
      body.results.map((r) => r.index),
      [0, 1],
      "results must come back positionally addressable",
    );
    assert.equal(body.results[0].subfolder, "");
    assert.equal(body.results[1].subfolder, "no-existe");
  });

  test("a batch larger than the cap is refused whole, before anything is deleted", async () => {
    await makeFile("seg-cap.flac");
    const files = Array.from({ length: 201 }, () => ({ filename: "seg-cap.flac" }));
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const res = await DELETE(req);

    assert.equal(res.status, 400);
    assert.equal(await exists("seg-cap.flac"), true, "nothing may be deleted when the batch is refused");
  });

  test("a missing filename inside one batch entry fails only that entry", async () => {
    await makeFile("seg-c1.flac");
    const req = new Request("http://localhost/api/takes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ filename: "" }, { filename: "seg-c1.flac" }] }),
    });
    const res = await DELETE(req);
    const body = (await res.json()) as { results: { filename: string; deleted: boolean }[] };

    assert.equal(res.status, 207);
    assert.equal(body.results[0].deleted, false);
    assert.equal(body.results[1].deleted, true);
    assert.equal(await exists("seg-c1.flac"), false);
  });
});
