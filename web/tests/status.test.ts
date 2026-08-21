import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { statusOf } from "../src/lib/tts.ts";

/**
 * These fixtures are not invented: they are what the real engine returned on
 * 2026-08-21 for a voice-registration graph (`Qwen3SavePrompt`) that had
 * finished successfully. It reports success with an EMPTY outputs object,
 * because its job is to write a file, not to hand back audio.
 */
const SUCCESS_NO_AUDIO = {
  status: {
    status_str: "success",
    completed: true,
    messages: [["execution_start", { timestamp: 1787339502322 }]],
  },
  outputs: {},
};

const SUCCESS_WITH_AUDIO = {
  status: { status_str: "success", completed: true, messages: [] },
  outputs: { "4": { audio: [{ filename: "ttsstudio_00001.flac", subfolder: "", type: "output" }] } },
};

const FAILED = {
  status: {
    status_str: "error",
    completed: false,
    messages: [
      ["execution_error", { node_type: "Qwen3PromptMaker", exception_message: "boom" }],
    ],
  },
  outputs: {},
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stand in for ComfyUI: history answers with `entry`, the queue is empty. */
function engineReturning(entry: unknown) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/history/")) {
      return new Response(JSON.stringify(entry === null ? {} : { PID: entry }), { status: 200 });
    }
    if (url.includes("/queue")) {
      return new Response(JSON.stringify({ queue_running: [], queue_pending: [] }), { status: 200 });
    }
    throw new Error(`fetch inesperado a ${url}`);
  }) as typeof fetch;
}

describe("statusOf", () => {
  // THE REGRESSION. Before this was handled, a successful registration fell
  // through the audio lookup, missed the queue (already gone from it), and came
  // back as "queued" with no position — forever. The UI would spin on a job
  // that had finished minutes earlier.
  test("a successful graph with no audio is finished, not queued", async () => {
    engineReturning(SUCCESS_NO_AUDIO);
    assert.deepEqual(await statusOf("PID"), { state: "finished" });
  });

  test("a successful graph with audio is done, and carries the file", async () => {
    engineReturning(SUCCESS_WITH_AUDIO);
    const status = await statusOf("PID");
    assert.equal(status.state, "done");
    assert.match(
      (status as { audioUrl: string }).audioUrl,
      /ttsstudio_00001\.flac/,
      "la URL debe apuntar al archivo real",
    );
  });

  test("an error is reported with the engine's own message, not a generic one", async () => {
    engineReturning(FAILED);
    const status = await statusOf("PID");
    assert.equal(status.state, "failed");
    assert.match((status as { message: string }).message, /Qwen3PromptMaker: boom/);
  });

  test("an unknown id stays queued — we know nothing about it yet", async () => {
    engineReturning(null);
    assert.deepEqual(await statusOf("PID"), { state: "queued", position: null });
  });
});
