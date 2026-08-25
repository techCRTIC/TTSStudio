import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { segmentViews } from "../src/lib/segment-view.ts";
import type { ScriptSegment, SegmentTrack } from "../src/lib/long-script.ts";

/**
 * The regression this file exists for, found against the real engine on
 * 2026-08-24: a three-segment script showed "tramo 1 de 1", then "de 2", then
 * "de 3". The screen was counting the segments that had STARTED instead of the
 * ones that exist, so the total chased the position — and the total is the
 * number a person watches to know how much is left.
 */

function segment(index: number): ScriptSegment {
  return { index, text: `tramo ${index}`, boundary: "sentence", chars: 100 };
}

function track(index: number, status: SegmentTrack["status"]): SegmentTrack {
  return {
    index,
    text: `tramo ${index}`,
    boundary: "sentence",
    chars: 100,
    status,
    seed: status === "done" || status === "redone" ? 42 : null,
    attempts: 1,
    filename: status === "done" || status === "redone" ? `s${index}.flac` : null,
    subfolder: "",
    type: "output",
    audioUrl: null,
  };
}

describe("segmentViews — el total no puede crecer con el progreso", () => {
  test("tres cortes y UN tramo empezado siguen siendo tres", () => {
    const views = segmentViews([segment(0), segment(1), segment(2)], [track(0, "generating")]);

    assert.equal(views.length, 3, "el total es cuántos cortes hay, no cuántos empezaron");
    assert.deepEqual(
      views.map((v) => v.state),
      ["generating", "pending", "pending"],
      "un tramo sin track todavía está pendiente, no ausente",
    );
  });

  test("el total se mantiene en cada paso de un guión de tres", () => {
    const segments = [segment(0), segment(1), segment(2)];
    const pasos: SegmentTrack[][] = [
      [],
      [track(0, "generating")],
      [track(0, "done"), track(1, "generating")],
      [track(0, "done"), track(1, "done"), track(2, "generating")],
      [track(0, "done"), track(1, "done"), track(2, "done")],
    ];

    for (const tracks of pasos) {
      assert.equal(
        segmentViews(segments, tracks).length,
        3,
        `con ${tracks.length} tramos empezados el total dejó de ser 3`,
      );
    }
  });

  test("sin ningún track, la tira ya muestra los cortes — es la vista previa", () => {
    const views = segmentViews([segment(0), segment(1)], []);

    assert.equal(views.length, 2);
    assert.ok(views.every((v) => v.state === "pending"));
    assert.equal(views[1].text, "tramo 1", "el texto del corte se ve antes de generar");
  });

  test("el orden lo fijan los cortes, no el orden en que llegaron los tracks", () => {
    const views = segmentViews(
      [segment(0), segment(1), segment(2)],
      [track(2, "done"), track(0, "done")],
    );

    assert.deepEqual(views.map((v) => v.index), [0, 1, 2]);
    assert.deepEqual(views.map((v) => v.state), ["done", "pending", "done"]);
  });

  test("un track aporta su semilla; uno pendiente no inventa ninguna", () => {
    const views = segmentViews([segment(0), segment(1)], [track(0, "done")]);

    assert.equal(views[0].seed, 42);
    assert.equal("seed" in views[1], false, "un tramo sin generar no tiene semilla que enseñar");
  });
});
