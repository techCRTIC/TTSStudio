import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHeaders, comfyUrl, comfyFetch, COMFY_BASE_URL } from "../src/lib/comfy.ts";

describe("sanitizeHeaders", () => {
  test("drops Origin — the header ComfyUI answers 403 to (ADR-001)", () => {
    const incoming = new Headers({ origin: "http://localhost:3000" });
    assert.equal(sanitizeHeaders(incoming).get("origin"), null);
  });

  test("drops Referer, Host and the hop-by-hop headers", () => {
    const incoming = new Headers({
      referer: "http://localhost:3000/studio",
      host: "localhost:3000",
      connection: "keep-alive",
      "content-length": "42",
    });
    const out = sanitizeHeaders(incoming);
    for (const h of ["referer", "host", "connection", "content-length"]) {
      assert.equal(out.get(h), null, `${h} debería haberse eliminado`);
    }
  });

  test("is case-insensitive about the header name", () => {
    const incoming = new Headers();
    incoming.set("OrIgIn", "http://evil.example");
    assert.equal(sanitizeHeaders(incoming).get("origin"), null);
  });

  test("keeps everything else untouched", () => {
    const incoming = new Headers({
      "content-type": "application/json",
      "x-custom": "keep-me",
    });
    const out = sanitizeHeaders(incoming);
    assert.equal(out.get("content-type"), "application/json");
    assert.equal(out.get("x-custom"), "keep-me");
  });
});

describe("comfyUrl", () => {
  test("joins segments onto the base and preserves the query", () => {
    assert.equal(comfyUrl(["history", "abc"], "?max=1"), `${COMFY_BASE_URL}/history/abc?max=1`);
  });
});

/**
 * The regression that matters. The unit tests above prove we strip the header;
 * only this one proves that stripping it is what makes ComfyUI answer.
 * Skipped — not failed — when ComfyUI is not running.
 */
describe("against a live ComfyUI", async () => {
  let live = false;
  try {
    const probe = await fetch(`${COMFY_BASE_URL}/system_stats`, {
      signal: AbortSignal.timeout(2000),
    });
    live = probe.ok;
  } catch {
    live = false;
  }

  test("a foreign Origin is refused — the constraint ADR-001 rests on", { skip: !live }, async () => {
    const res = await fetch(`${COMFY_BASE_URL}/queue`, {
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(res.status, 403, "si esto deja de ser 403, revisar ADR-001");
  });

  test("the same request through comfyFetch succeeds", { skip: !live }, async () => {
    const res = await comfyFetch(comfyUrl(["queue"]), {
      headers: new Headers({ origin: "http://localhost:3000" }),
    });
    assert.equal(res.status, 200, "comfyFetch dejó pasar el Origin");
  });
});
