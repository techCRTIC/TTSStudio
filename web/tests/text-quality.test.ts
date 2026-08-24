import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, reviewText } from "../src/lib/text-quality.ts";
import { projectRoot } from "../src/lib/python.ts";

/**
 * These run the REAL Python scripts. That is the point.
 *
 * THE SEAM THEY GUARD
 *   `execution/tts_revisar_texto.py` prints its verdict with Spanish keys
 *   (`nivel`, `codigo`, `mensaje`, `accion`, `ejemplos`) and `text-quality.ts`
 *   translates them into the app's shape. Nothing connects the two: if the
 *   script renames a key, TypeScript keeps compiling, the fetch keeps
 *   returning 200, and every field arrives `undefined` — the interface would
 *   render blank findings and the user would conclude their text is fine.
 *
 *   A mock would test the translation against itself. Running the script is
 *   what makes the seam observable, and these are cheap: both scripts are pure
 *   stdlib and return in milliseconds.
 *
 * They also pin the FINDINGS themselves, which are not style opinions but the
 * measured output of the `voz-local` research. A change to what counts as
 * blocking is a change to a measurement, and should have to break a test.
 */

describe("the Python bridge finds the project", () => {
  test("locates the root from wherever the tests run", () => {
    // `process.cwd()` is `web/` here and the repo root under other runners, so
    // the walk-up is the whole mechanism. If it breaks, every script call does.
    assert.ok(projectRoot().length > 0);
  });
});

describe("reviewText — the measured levers, end to end", () => {
  test("an ASCII-fied text is BLOCKING, not a polite suggestion", async () => {
    // The distinction was paid for in lost audio: ~25 files were generated
    // before a human heard the first one, and all had un-accented text.
    const review = await reviewText(
      "Hace tiempo terminamos el proyecto de ficcion sonora y quedamos contentos con como quedo",
    );

    const codes = review.findings.map((f) => f.code);
    assert.ok(codes.includes("sin_diacriticos"), `esperaba sin_diacriticos, hubo ${codes}`);
    assert.ok(review.blocking >= 1);
    assert.equal(
      review.findings.find((f) => f.code === "sin_diacriticos")?.level,
      "BLOQUEANTE",
    );
  });

  test("'ano' gets its own alarm — it is not a missing accent, it is another word", async () => {
    const review = await reviewText("El ano pasado fue muy intenso para todo el equipo.");
    assert.ok(review.findings.some((f) => f.code === "ano_sin_enie"));
  });

  test("every field survives the crossing", async () => {
    // The seam test proper: a finding whose message or action came back empty
    // would mean the Spanish keys stopped matching.
    const review = await reviewText("Hace tiempo terminamos el proyecto de ficcion sonora ya");
    assert.ok(review.findings.length > 0, "esperaba al menos un hallazgo");
    for (const finding of review.findings) {
      assert.ok(finding.code, "code vacío: ¿cambió la clave `codigo`?");
      assert.ok(finding.message, "message vacío: ¿cambió la clave `mensaje`?");
      assert.ok(finding.action, "action vacío: ¿cambió la clave `accion`?");
      assert.ok(
        finding.level === "BLOQUEANTE" || finding.level === "AVISO",
        `nivel inesperado: ${finding.level}`,
      );
    }
    assert.equal(typeof review.words, "number");
    assert.equal(typeof review.hasDiacritics, "boolean");
  });

  test("well-written Spanish raises nothing blocking", async () => {
    const review = await reviewText(
      "Ayer... terminamos el proyecto. Fueron seis meses. Seis meses de trabajo... y ahora, se acabó.",
    );
    assert.equal(review.blocking, 0);
    assert.equal(review.hasDiacritics, true);
  });

  test("digits are flagged, because voice models verbalise them badly", async () => {
    const review = await reviewText("El informe cierra el 31 de diciembre a las 9 en punto.");
    assert.ok(review.findings.some((f) => f.code === "numeros_en_digitos"));
  });
});

describe("normalizeText — what has exactly one correct reading", () => {
  test("dates, times and amounts become words", async () => {
    const { text } = await normalizeText("Cierra el 31/12/2026 a las 9:30 y costó $12.800.000.");
    assert.match(text, /treinta y uno de diciembre de dos mil veintiséis/);
    assert.match(text, /nueve y media/);
    assert.match(text, /doce millones ochocientos mil pesos/);
    assert.doesNotMatch(text, /\d/, "no debería quedar ningún dígito");
  });

  test("accents survive the process boundary", async () => {
    // Not cosmetic and not hypothetical: Python's stdout on Windows is cp1252,
    // Node decodes UTF-8, and every accent becomes U+FFFD. This text is what
    // the voice says. See execution/_console.py.
    const { text } = await normalizeText("Cierra el 31/12/2026.");
    assert.doesNotMatch(text, /�/, "hay caracteres de reemplazo: se rompió la codificación");
    assert.match(text, /veintiséis/);
  });

  test("an acronym is reported, never guessed", async () => {
    // "CRTIC" can be spelled out or read as a word. Getting it wrong sounds
    // worse than asking, so the script refuses to decide.
    const { text, warnings } = await normalizeText("Trabajamos en CRTIC desde hace tiempo.");
    assert.match(text, /CRTIC/, "no debe expandirla por su cuenta");
    assert.ok(warnings.some((w) => w.includes("CRTIC")));
  });

  test("a text with nothing to normalise comes back unchanged", async () => {
    const original = "Ayer terminamos el proyecto. Fueron seis meses de trabajo.";
    const { text, warnings } = await normalizeText(original);
    assert.equal(text.trim(), original);
    assert.deepEqual(warnings, []);
  });
});
