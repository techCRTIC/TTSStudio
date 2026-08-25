import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  SegmentInfo,
  SegmentStripProps,
  ActiveGeneration,
} from "../src/components/SegmentStrip.tsx";

/**
 * SegmentStrip — presentational, no route, no network. Fase 3 (guiones
 * largos).
 *
 * WHY THIS SUITE CARRIES ITS OWN LOADER
 *   Every other suite here tests plain `.ts` logic (route handlers, lib
 *   functions), so `node --test` has never had to load a `.tsx` file. Node's
 *   own type-stripping erases TYPE syntax, but JSX is not TypeScript — it
 *   genuinely needs a transform, and this project has none of `esbuild`,
 *   `swc` or `babel` as a dependency. `typescript` already is one (it is the
 *   compiler the whole project checks against), and `ts.transpileModule` does
 *   exactly this transform, synchronously, with no new install. The loader
 *   below is registered only in THIS file, not shared: `node --test` gives
 *   every test FILE its own process, so it cannot reach the other suites.
 *
 * WHY renderToStaticMarkup INSTEAD OF A DOM
 *   There is no jsdom or @testing-library in this project.
 *   `renderToStaticMarkup` needs neither: it runs the component through the
 *   real React reconciler and hands back the HTML string a browser would
 *   receive. Hooks run (this component calls `useState`); effects do not (no
 *   DOM) — which does not cost these assertions anything, because PanelSlot's
 *   effect only ever adjusts an already-rendered height, never what is IN the
 *   markup that decides pass/fail below.
 *
 * WHAT THIS DOES NOT COVER
 *   `prefers-reduced-motion` itself is a media query a browser evaluates —
 *   nothing here runs one. What IS checked is the thing that query is
 *   evaluated AGAINST: that no positional animation (`transform:` inline, or
 *   a `scale(0` start point) exists in the markup for it to ever have to
 *   suppress. And the "switches panels without losing the last one" behaviour
 *   of PanelSlot is not exercised — that needs two renders of the SAME
 *   mounted instance, which a one-shot static render cannot simulate; it is
 *   accepted here because SegmentStrip wires `shownIndex`/`openIndex` as the
 *   exact pair `app/page.tsx` already proves correct for `tool`/`shownTool`.
 */

const TS_ENTRY = pathToFileURL(
  path.join(import.meta.dirname, "..", "node_modules", "typescript", "lib", "typescript.js"),
).href;

const loaderSource = `
import ts from ${JSON.stringify(TS_ENTRY)};
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  // Relative imports without an extension ("./PanelSlot") are how this
  // codebase writes them everywhere — a bundler fills the extension in. Raw
  // Node ESM will not, so it is filled in here the same way the "@/" alias is
  // filled in by the sibling suite (tests/segments-split.test.ts).
  if (specifier.startsWith(".") && !/\\.[jt]sx?$/.test(specifier)) {
    for (const ext of [".tsx", ".ts"]) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {}
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".tsx") || url.endsWith(".ts")) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, "utf8");
    // fileName must keep the real extension: TypeScript only parses JSX
    // syntax inside a name ending ".tsx" — in ".ts" it would read "<Foo>" as
    // a type assertion and fail on the very first tag.
    const { outputText } = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

let SegmentStrip: typeof import("../src/components/SegmentStrip.tsx").SegmentStrip;

before(async () => {
  ({ SegmentStrip } = await import("../src/components/SegmentStrip.tsx"));
});

function renderStrip(props: SegmentStripProps): string {
  return renderToStaticMarkup(createElement(SegmentStrip, props));
}

function segment(over: Partial<SegmentInfo> & Pick<SegmentInfo, "index" | "state">): SegmentInfo {
  return {
    text: `Texto del tramo ${over.index + 1}.`,
    chars: 120,
    boundary: "sentence",
    ...over,
  };
}

const noop = () => {};

/**
 * The full opening tag of the FIRST `<button>…label<` in `html`, so a test
 * can check its attributes (`disabled=""`) without guessing how far back the
 * tag starts — Tailwind's class strings on these buttons run well past 150
 * characters, so a fixed-width slice back from the label undercuts the tag.
 */
function buttonTag(html: string, label: string): string {
  const labelIndex = html.indexOf(`>${label}<`);
  assert.ok(labelIndex >= 0, `no se encontró el botón "${label}"`);
  const openIndex = html.lastIndexOf("<button", labelIndex);
  assert.ok(openIndex >= 0, `no se encontró la apertura de "<button>" para "${label}"`);
  return html.slice(openIndex, labelIndex);
}

function one(seg: SegmentInfo, extra?: Partial<SegmentStripProps>): SegmentStripProps {
  return {
    segments: [seg],
    active: null,
    openIndex: null,
    onOpen: noop,
    onListen: noop,
    onRedo: noop,
    ...extra,
  };
}

describe("SegmentStrip", () => {
  test("una lista vacía no rompe nada — no hay tramos, no hay tira", () => {
    assert.equal(
      renderStrip({ segments: [], active: null, openIndex: null, onOpen: noop, onListen: noop, onRedo: noop }),
      "",
    );
  });

  test("los cinco estados llevan cinco geometrías distintas — el color nunca es la única diferencia", () => {
    const states: SegmentInfo["state"][] = ["pending", "generating", "done", "redone", "failed"];
    const shapes = states.map((state) => {
      const html = renderStrip(one(segment({ index: 0, state })));
      const match = html.match(/data-mark-shape="([^"]+)"/);
      assert.ok(match, `el tramo en estado "${state}" no llevó ninguna forma`);
      return match![1];
    });
    assert.equal(new Set(shapes).size, 5, `las formas se repitieron: ${shapes.join(", ")}`);
  });

  test('"hecho" y "rehecho" difieren en la geometría real del SVG, no solo en una etiqueta', () => {
    const done = renderStrip(one(segment({ index: 0, state: "done" })));
    const redone = renderStrip(one(segment({ index: 0, state: "redone" })));

    // "hecho" es un disco (círculo relleno) con un check; nunca lleva <rect>.
    assert.ok(done.includes("<circle"), "hecho debería dibujar un círculo");
    assert.ok(!done.includes("<rect"), "hecho no debería usar la forma de rehecho");

    // "rehecho" es un cuadrado — la única forma de las cinco que usa <rect> —
    // precisamente para que un daltónico no pueda confundirlo con "hecho".
    assert.ok(redone.includes("<rect"), "rehecho debería dibujar un cuadrado, no un círculo");
  });

  test('el contador dice "Tramo K de N" con cifras tabulares', () => {
    const segments = Array.from({ length: 12 }, (_, i) => segment({ index: i, state: "pending" }));
    const active: ActiveGeneration = { index: 5, status: { kind: "running" } };
    const html = renderStrip({ segments, active, openIndex: null, onOpen: noop, onListen: noop, onRedo: noop });

    assert.match(html, /Tramo 6 de 12/, "K es 1-based sobre el índice activo, N es el total");
    // La cifra debe vivir dentro de un nodo con la utilidad tabular-nums —
    // si no, el ancho del contador salta con cada dígito.
    const counterNode = html.match(/<span class="([^"]*)">Tramo 6 de 12<\/span>/);
    assert.ok(counterNode, "no se encontró el nodo del contador");
    assert.match(counterNode![1], /\btabular-nums\b/);
  });

  test('el motor solo dice "en cola, con puesto" o "trabajando" — nunca un porcentaje', () => {
    const segments = Array.from({ length: 4 }, (_, i) => segment({ index: i, state: "pending" }));

    const scenarios: { active: ActiveGeneration | null }[] = [
      { active: { index: 0, status: { kind: "queued", position: 3 } } },
      { active: { index: 1, status: { kind: "running" } } },
      { active: { index: 2, status: { kind: "queued", position: null } } },
      { active: null },
    ];

    for (const { active } of scenarios) {
      const html = renderStrip({ segments, active, openIndex: null, onOpen: noop, onListen: noop, onRedo: noop });
      assert.ok(!html.includes("%"), `un porcentaje se coló con active=${JSON.stringify(active)}`);
    }

    const queued = renderStrip({
      segments,
      active: { index: 0, status: { kind: "queued", position: 3 } },
      openIndex: null,
      onOpen: noop,
      onListen: noop,
      onRedo: noop,
    });
    assert.match(queued, /En cola, posición 3/);

    const running = renderStrip({
      segments,
      active: { index: 1, status: { kind: "running" } },
      openIndex: null,
      onOpen: noop,
      onListen: noop,
      onRedo: noop,
    });
    assert.match(running, /Generando/);
  });

  test("con movimiento reducido no quedan desplazamientos: nada anima transform en línea ni parte de scale(0)", () => {
    const segments = (["pending", "generating", "done", "redone", "failed"] as const).map((state, i) =>
      segment({ index: i, state }),
    );
    const html = renderStrip({
      segments,
      active: { index: 1, status: { kind: "running" } },
      openIndex: 2,
      onOpen: noop,
      onListen: noop,
      onRedo: noop,
    });

    assert.ok(!html.includes("transform:"), "un transform en línea no se apaga con prefers-reduced-motion");
    assert.ok(!html.includes("scale(0"), "nada debería animar partiendo de scale(0)");

    // SegmentStrip en sí no lleva NINGÚN `style` en línea (regla del agente).
    // El único `style="…"` del árbol es el de PanelSlot — un archivo ajeno,
    // con una excepción ya documentada (mide y anima `height`) — y ni
    // siquiera ese contiene `transform`, verificado arriba sobre el HTML
    // completo. Contar las apariciones confirma que SegmentStrip no añadió
    // una propia.
    const styleAttrs = html.match(/style="[^"]*"/g) ?? [];
    assert.equal(
      styleAttrs.length,
      1,
      `se esperaba un único style en línea (el de PanelSlot), se vieron: ${styleAttrs.join(" | ")}`,
    );
  });

  test("abrir un tramo hecho muestra su texto y dos botones habilitados", () => {
    const seg = segment({ index: 2, state: "done", text: "Este es el tramo tres.", seed: 4242 });
    const html = renderStrip(one(seg, { openIndex: 2 }));

    assert.ok(html.includes("Este es el tramo tres."), "el texto del tramo debería estar en el detalle");
    assert.match(html, />Escuchar</);
    assert.match(html, />Rehacer</);
    // Ninguno de los dos botones lleva el atributo disabled.
    assert.ok(!/disabled=""/.test(buttonTag(html, "Escuchar")));
    assert.ok(!/disabled=""/.test(buttonTag(html, "Rehacer")));
  });

  test("un tramo pendiente abierto no ofrece escuchar ni rehacer — no hay toma todavía", () => {
    const seg = segment({ index: 0, state: "pending" });
    const html = renderStrip(one(seg, { openIndex: 0 }));

    assert.match(buttonTag(html, "Escuchar"), /disabled=""/);
    assert.match(buttonTag(html, "Rehacer"), /disabled=""/);
  });

  test("un tramo rehecho dice, en el propio detalle, que la aplicación lo rehizo sola", () => {
    const seg = segment({ index: 4, state: "redone", seed: 777 });
    const html = renderStrip(one(seg, { openIndex: 4 }));

    assert.match(html, /rehizo sola/);
    assert.match(html, /otra semilla/);
    assert.match(html, /777/);
  });

  test("un tramo fallado muestra el mensaje real del motor y ofrece «Reintentar»", () => {
    const seg = segment({ index: 1, state: "failed", error: "Qwen3VoiceClone: boom" });
    const html = renderStrip(one(seg, { openIndex: 1 }));

    assert.match(html, /Qwen3VoiceClone: boom/);
    assert.match(html, />Reintentar</);
  });

  test("aria-live aparece una sola vez — atenuado, no un anuncio por marca", () => {
    const segments = Array.from({ length: 8 }, (_, i) => segment({ index: i, state: "pending" }));
    const html = renderStrip({ segments, active: null, openIndex: null, onOpen: noop, onListen: noop, onRedo: noop });

    const matches = html.match(/aria-live="polite"/g) ?? [];
    assert.equal(matches.length, 1, "cada tramo cambiando de estado no debería anunciarse por separado");
  });

  test("cada marca mide 44×44 px de área táctil (h-11 w-11), aunque el dibujo sea de 10px", () => {
    const html = renderStrip(one(segment({ index: 0, state: "pending" })));
    assert.match(html, /\bh-11 w-11\b/);
  });
});
