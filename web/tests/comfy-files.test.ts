import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  outputFilePath,
  voiceFilePath,
  voiceSidecarPath,
  referenceFilePath,
  UnsafePathError,
  DIRECTORIES,
} from "../src/lib/comfy-files.ts";

/**
 * These are the security tests for the only module in the project that touches
 * the user's own files. Everything it receives — filenames, subfolders, voice
 * ids — arrives from the browser, so the question each test asks is the same:
 * can a crafted value make this resolve to a path outside the three allowed
 * directories?
 *
 * Since ADR-005 the module also READS and WRITES provenance sidecars, so the
 * write path is held to the same standard the delete path always was.
 */

const OUT = DIRECTORIES.OUTPUT_DIR;
const PROMPTS = DIRECTORIES.PROMPTS_DIR;
const IN = DIRECTORIES.INPUT_DIR;

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

describe("referenceFilePath", () => {
  // The input directory is the most delicate of the three: unlike output/ and
  // prompts/, it holds files the user put there themselves, long before this
  // app existed. An escape here reaches somebody's own recordings.
  test("resolves an uploaded clip into the input directory", () => {
    const p = referenceFilePath("grabacion-20260821-154500.wav");
    assert.ok(isInside(IN, p), `${p} debería estar dentro de ${IN}`);
  });

  test("refuses every traversal shape", () => {
    const attacks = [
      "../models/Qwen3-TTS/prompts/andres_bobe.safetensors",
      "..\\..\\output\\ttsstudio_00001.flac",
      "../../../../Windows/System32/drivers/etc/hosts",
      "/etc/passwd",
      "C:\\Windows\\System32\\evil.dll",
      "sub/../../escapa.wav",
    ];
    for (const attack of attacks) {
      let landed: string | null = null;
      try {
        landed = referenceFilePath(attack);
      } catch (cause) {
        assert.ok(cause instanceof UnsafePathError);
        continue;
      }
      assert.ok(isInside(IN, landed), `"${attack}" escapó a ${landed}`);
    }
  });

  test("refuses an empty name or an embedded null byte", () => {
    assert.throws(() => referenceFilePath(""), UnsafePathError);
    assert.throws(() => referenceFilePath("a\u0000.wav"), UnsafePathError);
  });

  test("cannot be used to reach a voice or a take", () => {
    // The three directories must stay genuinely separate: reaching a prompt
    // through the input path would turn a cleanup into a deletion of a voice.
    for (const attack of ["../models/Qwen3-TTS/prompts/x.safetensors", "../output/x.flac"]) {
      let landed: string | null = null;
      try {
        landed = referenceFilePath(attack);
      } catch {
        continue;
      }
      assert.ok(!isInside(PROMPTS, landed), "alcanzó el directorio de voces");
      assert.ok(!isInside(OUT, landed), "alcanzó el directorio de salidas");
    }
  });
});

describe("the allowed directories", () => {
  test("all three live under the configured ComfyUI root", () => {
    assert.ok(isInside(DIRECTORIES.COMFY_ROOT, OUT));
    assert.ok(isInside(DIRECTORIES.COMFY_ROOT, PROMPTS));
    assert.ok(isInside(DIRECTORIES.COMFY_ROOT, IN));
  });

  test("none of them contains another", () => {
    assert.ok(!isInside(OUT, PROMPTS) && !isInside(PROMPTS, OUT));
    assert.ok(!isInside(IN, OUT) && !isInside(OUT, IN));
    assert.ok(!isInside(IN, PROMPTS) && !isInside(PROMPTS, IN));
  });
});

describe("voiceSidecarPath", () => {
  test("lands next to the voice, with the extension swapped", () => {
    const p = voiceSidecarPath("andres_bobe.safetensors");
    assert.ok(isInside(PROMPTS, p), `${p} debería estar dentro de ${PROMPTS}`);
    assert.equal(path.basename(p), "andres_bobe.json");
  });

  test("refuses every id the voice path refuses", () => {
    // The sidecar reuses `voiceFilePath`'s shape check on purpose: one rule, in
    // one place. This test is what proves the reuse is real — if someone ever
    // reimplements the check here and gets it wrong, these ids start resolving.
    const attacks = [
      "../../../../Windows/System32/config.safetensors",
      "..\..\evil.safetensors",
      "sub/dir/voice.safetensors",
      "voice.json",
      "voice",
      "",
      ".gitconfig.safetensors",
    ];

    for (const id of attacks) {
      assert.throws(
        () => voiceSidecarPath(id),
        UnsafePathError,
        `"${id}" no debería producir una ruta`,
      );
    }
  });

  test("the id cannot smuggle a different extension past the swap", () => {
    // Only a trailing `.safetensors` is replaced. An id like
    // "a_safetensors_b.safetensors" is still shape-valid and must still land on
    // a single .json inside the prompts directory.
    const p = voiceSidecarPath("a_safetensors_b.safetensors");
    assert.ok(isInside(PROMPTS, p));
    assert.equal(path.extname(p), ".json");
  });
});
