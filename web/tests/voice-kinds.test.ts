import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow } from "../src/lib/tts.ts";

/**
 * Two kinds of voice, two nodes — and getting it wrong is invisible until the
 * engine answers.
 *
 * A cloned voice is said by `Qwen3VoiceClone`, which loads a `.safetensors`
 * prompt computed from a person's recording. One of the model's own nine
 * speakers is said by `Qwen3CustomVoice`, which takes the speaker as a plain
 * string and looks it up inside its own weights.
 *
 * Sending a preset name where a prompt file belongs does not throw here, does
 * not fail typechecking, and does not fail any other test: ComfyUI rejects the
 * graph at generation time, minutes into a long script. This file is the check
 * that runs in a second instead.
 *
 * Read from the pack's real declaration (`ComfyUI-Qwen3-TTS/nodes.py`, class
 * `Qwen3CustomVoice`, 2026-08-24) — not recalled.
 */

type Node = { class_type: string; inputs: Record<string, unknown> };
type Graph = Record<string, Node>;

function nodeOfType(graph: Graph, classType: string): Node | undefined {
  return Object.values(graph).find((node) => node.class_type === classType);
}

describe("buildWorkflow — la voz decide el nodo", () => {
  test("una voz clonada va por Qwen3VoiceClone y carga su archivo de prompt", () => {
    const graph = buildWorkflow("hola", "andres_bobe.safetensors", 42, {}, "cloned") as Graph;

    const clone = nodeOfType(graph, "Qwen3VoiceClone");
    assert.ok(clone, "falta el nodo de clonación");
    assert.equal(nodeOfType(graph, "Qwen3CustomVoice"), undefined, "no debe aparecer el nodo de presets");

    const loader = nodeOfType(graph, "Qwen3LoadPrompt");
    assert.ok(loader, "una voz clonada necesita cargar su prompt");
    assert.equal(loader.inputs.prompt_file, "andres_bobe.safetensors");
  });

  test("una voz del modelo va por Qwen3CustomVoice, con el hablante como texto", () => {
    const graph = buildWorkflow("hola", "Vivian", 42, {}, "preset") as Graph;

    const custom = nodeOfType(graph, "Qwen3CustomVoice");
    assert.ok(custom, "falta el nodo de voces del modelo");
    assert.equal(custom.inputs.speaker, "Vivian");
    assert.equal(nodeOfType(graph, "Qwen3VoiceClone"), undefined, "no debe aparecer el nodo de clonación");

    // There is nothing to load: the speaker lives in the model's weights.
    assert.equal(
      nodeOfType(graph, "Qwen3LoadPrompt"),
      undefined,
      "una voz del modelo no carga ningún archivo de prompt",
    );
  });

  test("por defecto se asume clonada — el camino que siempre ha corrido", () => {
    const graph = buildWorkflow("hola", "andres_bobe.safetensors", 42) as Graph;
    assert.ok(nodeOfType(graph, "Qwen3VoiceClone"));
  });

  test("la intención solo entra en el grafo de las voces del modelo", () => {
    const preset = buildWorkflow("hola", "Vivian", 42, { instruct: "tranquilo" }, "preset") as Graph;
    assert.equal(nodeOfType(preset, "Qwen3CustomVoice")!.inputs.instruct, "tranquilo");

    // On the clone path the node has no such input, so it must not be there at
    // all — a key ComfyUI ignores is a lever the interface would be pretending
    // to have.
    const cloned = buildWorkflow("hola", "x.safetensors", 42, { instruct: "tranquilo" }, "cloned") as Graph;
    assert.equal(
      "instruct" in nodeOfType(cloned, "Qwen3VoiceClone")!.inputs,
      false,
      "la intención no puede aparecer en el grafo de una voz clonada",
    );
  });

  test("una intención vacía no viaja: se omite en vez de mandarse en blanco", () => {
    for (const instruct of ["", "   "]) {
      const graph = buildWorkflow("hola", "Vivian", 42, { instruct }, "preset") as Graph;
      assert.equal("instruct" in nodeOfType(graph, "Qwen3CustomVoice")!.inputs, false);
    }
  });

  test("ambos caminos guardan el audio y comparten los mismos límites", () => {
    for (const [voiceId, kind] of [["x.safetensors", "cloned"], ["Vivian", "preset"]] as const) {
      const graph = buildWorkflow("hola", voiceId, 42, { language: "Spanish" }, kind) as Graph;
      const save = nodeOfType(graph, "SaveAudio");
      assert.ok(save, `${kind}: falta SaveAudio`);

      const speaker = nodeOfType(graph, kind === "preset" ? "Qwen3CustomVoice" : "Qwen3VoiceClone")!;
      assert.equal(speaker.inputs.language, "Spanish", `${kind}: el idioma no llegó`);
      assert.equal(typeof speaker.inputs.max_new_tokens, "number", `${kind}: falta el techo de duración`);
      assert.equal(speaker.inputs.seed, 42, `${kind}: la semilla no llegó`);
    }
  });
});
