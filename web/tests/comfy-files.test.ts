import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  outputFilePath,
  voiceFilePath,
  UnsafePathError,
  DIRECTORIES,
} from "../src/lib/comfy-files.ts";

/**
 * These are the security tests for the only module in the project that deletes
 * files. Everything it receives — filenames, subfolders, voice ids — arrives
 * from the browser, so the question each test asks is the same: can a crafted
 * value make this resolve to a path outside the two allowed directories?
 */

const OUT = DIRECTORIES.OUTPUT_DIR;
const PROMPTS = DIRECTORIES.PROMPTS_DIR;

/** True when `p` really sits inside `base` — the property under test. */
function isInside(base: string, p: string): boolean {
  const fence = base.endsWith(path.sep) ? base : base + path.sep;
  return p.startsWith(fence);
}

describe("outputFilePath", () => {
  test("resolves an ordinary file into the output directory", () => {
    const p = outputFilePath({ filename: "ttsstudio_00007.flac" });
    assert.ok(isInside(OUT, p), `${p} debería estar dentro de ${OUT}`);
    assert.equal(path.basename(p), "ttsstudio_00007.flac");
  });

  test("honours a subfolder without letting it escape", () => {
    const p = outputFilePath({ filename: "a.flac", subfolder: "audio" });
    assert.ok(isInside(OUT, p));
  });

  test("refuses every traversal shape", () => {
    const attacks: { filename: string; subfolder?: string }[] = [
      { filename: "../../../../Windows/System32/drivers/etc/hosts" },
      { filename: "..\\..\\..\\secret.txt" },
      { filename: "a.flac", subfolder: "../../models" },
      { filename: "a.flac", subfolder: "..\\.." },
      { filename: "../.env" },
      { filename: "a.flac", subfolder: "../../../../" },
    ];

    for (const attack of attacks) {
      let landed: string | null = null;
      try {
        landed = outputFilePath(attack);
      } catch (cause) {
        assert.ok(cause instanceof UnsafePathError, "debería ser UnsafePathError");
        continue;
      }
      // If it did not throw, it must at least still be inside — a traversal
      // that resolves back into the directory is harmless, one that escapes
      // is the bug this whole test exists for.
      assert.ok(isInside(OUT, landed), `${JSON.stringify(attack)} escapó a ${landed}`);
    }
  });

  test("refuses an absolute path outright", () => {
    for (const filename of ["C:\\Windows\\System32\\evil.dll", "/etc/passwd"]) {
      let landed: string | null = null;
      try {
        landed = outputFilePath({ filename });
      } catch (cause) {
        assert.ok(cause instanceof UnsafePathError);
        continue;
      }
      assert.ok(isInside(OUT, landed), `${filename} escapó a ${landed}`);
    }
  });

  test("only an output may be deleted — never an input or a temp", () => {
    for (const type of ["input", "temp", "", "OUTPUT"]) {
      assert.throws(
        () => outputFilePath({ filename: "a.flac", type }),
        UnsafePathError,
        `el tipo "${type}" no debería aceptarse`,
      );
    }
  });

  test("refuses an empty name or an embedded null byte", () => {
    assert.throws(() => outputFilePath({ filename: "" }), UnsafePathError);
    assert.throws(() => outputFilePath({ filename: "a\u0000.flac" }), UnsafePathError);
  });
});

describe("voiceFilePath", () => {
  test("resolves a real voice id into the prompts directory", () => {
    const p = voiceFilePath("andres_bobe.safetensors");
    assert.ok(isInside(PROMPTS, p));
    assert.equal(path.basename(p), "andres_bobe.safetensors");
  });

  test("refuses anything that is not a plain .safetensors name", () => {
    const attacks = [
      "../../../evil.safetensors",
      "..\\evil.safetensors",
      "/etc/passwd",
      "andres_bobe.safetensors.exe",
      "andres bobe.safetensors", // a space is not in the allowed set
      "andres_bobe",
      "andres_bobe.txt",
      "",
      ".safetensors",
      "a/b.safetensors",
    ];
    for (const attack of attacks) {
      assert.throws(
        () => voiceFilePath(attack),
        UnsafePathError,
        `"${attack}" debería rechazarse`,
      );
    }
  });
});

describe("the allowed directories", () => {
  test("both live under the configured ComfyUI root", () => {
    assert.ok(isInside(DIRECTORIES.COMFY_ROOT, OUT));
    assert.ok(isInside(DIRECTORIES.COMFY_ROOT, PROMPTS));
  });
});
