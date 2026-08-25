import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  acceptableRewrite,
  CONTEXT_TOKENS,
  MAX_REWRITE_CHARS,
  parseContextTokens,
  proposeRewrite,
  TextTooLongError,
} from "../src/lib/llm.ts";

/**
 * `web/src/lib/llm.ts` — the context window, and the two guards around it.
 *
 * WHY THIS FILE EXISTS (2026-08-24). The rewrite ran without `num_ctx`, so
 * ollama used a server default in the low thousands while `qwen3:4b` can hold
 * 262 144 tokens. Over that window ollama DROPS THE BEGINNING of the prompt
 * with no error, so a long script came back rewritten from the middle and
 * looked like a normal answer. Nothing in the suite covered this module at all.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("la ventana de contexto se pide explícitamente", () => {
  test("num_ctx viaja en cada llamada al modelo", async () => {
    let enviado: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      enviado = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ response: "Un texto reescrito, con su ritmo." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await proposeRewrite("Un texto cualquiera que reescribir.");

    assert.ok(enviado, "no se llamó al modelo");
    const options = (enviado as { options?: Record<string, unknown> }).options ?? {};
    assert.equal(
      options.num_ctx,
      CONTEXT_TOKENS,
      "sin num_ctx, ollama recorta el principio del prompt en silencio",
    );
  });

  test("el tope de caracteres se DERIVA de la ventana, no se escribe a mano", () => {
    // Si alguien sube la ventana, el tope tiene que subir solo. Un gemelo
    // escrito a mano se queda atrás sin que nadie lo note.
    assert.ok(MAX_REWRITE_CHARS > 0);
    assert.ok(
      MAX_REWRITE_CHARS < CONTEXT_TOKENS * 3,
      "el guión se paga DOS veces (entra y sale), así que nunca puede ocupar la ventana entera",
    );
    // Con la ventana actual tiene que caber holgadamente un guión de varios
    // minutos: si esto se rompe, el tope se volvió inservible en la práctica.
    assert.ok(MAX_REWRITE_CHARS > 8_000, `tope demasiado bajo: ${MAX_REWRITE_CHARS}`);
  });
});

describe("un guión más largo que la ventana se rechaza, no se trunca", () => {
  test("lanza TextTooLongError y NO llama al modelo", async () => {
    let llamadas = 0;
    globalThis.fetch = (async () => {
      llamadas += 1;
      return new Response(JSON.stringify({ response: "x" }), { status: 200 });
    }) as typeof fetch;

    const demasiado = "a".repeat(MAX_REWRITE_CHARS + 1);

    await assert.rejects(() => proposeRewrite(demasiado), TextTooLongError);
    assert.equal(llamadas, 0, "no se gasta medio minuto en una llamada que va a salir mutilada");
  });

  test("justo en el tope sí se acepta", async () => {
    let llamadas = 0;
    globalThis.fetch = (async () => {
      llamadas += 1;
      return new Response(JSON.stringify({ response: "b".repeat(MAX_REWRITE_CHARS) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await proposeRewrite("c".repeat(MAX_REWRITE_CHARS));
    assert.equal(llamadas, 1, "el tope es inclusivo: lo que cabe, entra");
  });
});

describe("acceptableRewrite — la firma de una reescritura a medias", () => {
  const largo = "Una frase con su punto. ".repeat(20); // 480 caracteres

  test("rechaza una reescritura que perdió la mitad del guión", () => {
    // Este es EL caso: antes solo se miraba que no estuviera vacía, así que
    // media reescritura llegaba a pantalla pareciendo entera.
    assert.equal(acceptableRewrite(largo.slice(0, largo.length / 2), largo), false);
  });

  test("acepta una reescritura de longitud parecida", () => {
    assert.equal(acceptableRewrite(largo, largo), true);
  });

  test("acepta una reescritura MÁS larga: escribir para la voz alarga", () => {
    assert.equal(acceptableRewrite(largo + largo.slice(0, 100), largo), true);
  });

  test("rechaza la respuesta vacía", () => {
    assert.equal(acceptableRewrite("", largo), false);
    assert.equal(acceptableRewrite("", "hola"), false);
  });

  test("un texto corto no se juzga por proporción", () => {
    // "Hola" -> "¡Hola!" cambia mucho en proporción y no tiene nada de malo.
    assert.equal(acceptableRewrite("¡Hola!", "hola"), true);
  });
});

describe("parseContextTokens — un valor basura no puede desarmar el tope", () => {
  // NaN no lanza: se propaga. MAX_REWRITE_CHARS se vuelve NaN, `length > NaN`
  // es false SIEMPRE, y el tope deja de existir con el mismo aspecto que
  // tenía. Es exactamente el fallo silencioso que este módulo vino a quitar.
  test("un valor no numérico cae al de por defecto, no a NaN", () => {
    const v = parseContextTokens("abc");
    assert.ok(Number.isFinite(v), "NaN desarmaría el tope sin avisar");
    assert.equal(v, 16_384);
  });

  test("sin valor, o vacío, se usa el de por defecto", () => {
    assert.equal(parseContextTokens(undefined), 16_384);
    assert.equal(parseContextTokens(""), 16_384);
    assert.equal(parseContextTokens("   "), 16_384);
  });

  test("una ventana absurdamente pequeña se ignora", () => {
    // Por debajo del suelo no cabe ni el guión más corto con su instrucción.
    assert.equal(parseContextTokens("16"), 16_384);
    assert.equal(parseContextTokens("0"), 16_384);
    assert.equal(parseContextTokens("-4096"), 16_384);
  });

  test("un valor válido sí se respeta", () => {
    assert.equal(parseContextTokens("32768"), 32_768);
    assert.equal(parseContextTokens("2048"), 2_048);
  });

  test("un decimal no es un número de tokens", () => {
    assert.equal(parseContextTokens("8192.5"), 16_384);
  });

  test("el tope derivado nunca es NaN", () => {
    assert.ok(Number.isFinite(MAX_REWRITE_CHARS));
    assert.ok(Number.isFinite(CONTEXT_TOKENS));
  });
});
