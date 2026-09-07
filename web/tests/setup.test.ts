import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aInforme,
  bloqueantes,
  debeAbrirse,
  type InformeSetup,
} from "../src/lib/setup.ts";

/**
 * `web/src/lib/setup.ts` — la frontera entre el auditor y la pantalla.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE (2026-09-07, ADR-008). Lo que cruza aquí viene
 * de un proceso de Python por stdout, que es exactamente la clase de frontera
 * que ningún analizador ve entera — la misma clase que ya se comió a este
 * proyecto una vez. Y lo que se decide al cruzarla no es cosmético: si un
 * estado desconocido se leyera como «instalada», la app abriría prometiendo
 * generar voz con un motor que no está.
 *
 * Se prueba la DIRECCIÓN DEL FALLO, no solo el camino feliz.
 */

function requisito(parcial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "x",
    titulo: "Algo",
    para_que: "Para algo",
    bloquea: false,
    instalable: false,
    tipo: "modelo",
    estado: "instalada",
    detalle: null,
    mb: 0,
    sin_esto: null,
    guia: null,
    nota: null,
    ...parcial,
  };
}

describe("aInforme: lo que llega de Python no se cree, se estrecha", () => {
  test("lee un informe bien formado", () => {
    const informe = aInforme({
      workspace: "C:/comfy",
      comfyui_url: "http://127.0.0.1:8188",
      comfyui_corriendo: true,
      disco_libre_mb: 1000,
      requisitos: [requisito({ id: "motor", estado: "falta", bloquea: true, mb: 4096 })],
    });
    assert.equal(informe.workspace, "C:/comfy");
    assert.equal(informe.comfyui_corriendo, true);
    assert.equal(informe.requisitos.length, 1);
    assert.equal(informe.requisitos[0].mb, 4096);
  });

  test("un estado desconocido cae en `no_verificable`, NUNCA en `instalada`", () => {
    // Este es el test que justifica el archivo. Leer mal hacia «instalada»
    // produce una app que promete lo que no puede cumplir; leer mal hacia
    // «no se pudo comprobar» solo produce una frase honesta.
    for (const basura of ["listo", "ok", "", null, 1, true, undefined, {}]) {
      const informe = aInforme({ requisitos: [requisito({ estado: basura })] });
      assert.equal(informe.requisitos[0].estado, "no_verificable", `con ${String(basura)}`);
    }
  });

  test("`instalada` solo si lo dice con esa palabra exacta", () => {
    assert.equal(
      aInforme({ requisitos: [requisito({ estado: "instalada" })] }).requisitos[0].estado,
      "instalada",
    );
    assert.equal(
      aInforme({ requisitos: [requisito({ estado: "Instalada" })] }).requisitos[0].estado,
      "no_verificable",
    );
  });

  test("las banderas solo son ciertas con `true` literal", () => {
    // Un "true" de texto, o un 1, no convierten algo opcional en bloqueante
    // ni al revés.
    const informe = aInforme({
      requisitos: [requisito({ bloquea: "true", instalable: 1 })],
    });
    assert.equal(informe.requisitos[0].bloquea, false);
    assert.equal(informe.requisitos[0].instalable, false);
  });

  test("un requisito sin id se descarta entero en vez de colarse a medias", () => {
    const informe = aInforme({
      requisitos: [requisito({ id: "bueno" }), requisito({ id: "" }), { nada: 1 }, null, "texto"],
    });
    assert.deepEqual(
      informe.requisitos.map((r) => r.id),
      ["bueno"],
    );
  });

  test("un mb que no es número se lee como 0, no como NaN", () => {
    // NaN no lanza: se propaga. Un `NaN` aquí llegaría a la pantalla como
    // "NaN GB" y a la comprobación de disco como una comparación siempre falsa.
    for (const basura of ["4096", null, undefined, "mucho", NaN, Infinity]) {
      const informe = aInforme({ requisitos: [requisito({ mb: basura })] });
      assert.equal(informe.requisitos[0].mb, 0, `con ${String(basura)}`);
      assert.ok(Number.isFinite(informe.requisitos[0].mb));
    }
  });

  test("una respuesta que no es un objeto da un informe vacío, no una excepción", () => {
    for (const basura of [null, undefined, "", 0, [], "texto"]) {
      const informe = aInforme(basura);
      assert.deepEqual(informe.requisitos, []);
      assert.equal(informe.comfyui_corriendo, false);
    }
  });

  test("una cadena vacía se lee como ausente, no como texto que pintar", () => {
    const informe = aInforme({ requisitos: [requisito({ detalle: "", guia: "" })] });
    assert.equal(informe.requisitos[0].detalle, null);
    assert.equal(informe.requisitos[0].guia, null);
  });
});

describe("cuándo el portal se abre solo", () => {
  const conRequisitos = (rs: Record<string, unknown>[]): InformeSetup =>
    aInforme({ requisitos: rs });

  test("se abre si falta algo que bloquea", () => {
    const informe = conRequisitos([requisito({ bloquea: true, estado: "falta" })]);
    assert.equal(debeAbrirse(informe), true);
    assert.equal(bloqueantes(informe).length, 1);
  });

  test("NO se abre por algo opcional que falta", () => {
    const informe = conRequisitos([requisito({ bloquea: false, estado: "falta" })]);
    assert.equal(debeAbrirse(informe), false);
  });

  test("NO se abre por un `no_verificable`, aunque bloquee", () => {
    // Interrumpir a alguien porque nosotros no pudimos comprobar algo es
    // cobrarle nuestra ignorancia. Con ComfyUI apagado, el pack sale así.
    const informe = conRequisitos([requisito({ bloquea: true, estado: "no_verificable" })]);
    assert.equal(debeAbrirse(informe), false);
  });

  test("no se abre con todo en su sitio", () => {
    const informe = conRequisitos([
      requisito({ bloquea: true, estado: "instalada" }),
      requisito({ bloquea: false, estado: "falta" }),
    ]);
    assert.equal(debeAbrirse(informe), false);
  });

  test("un informe vacío no abre nada", () => {
    // Si la auditoría no pudo correr, la app abre normal. Una comprobación de
    // entorno no puede ser el motivo de que no se vea la app.
    assert.equal(debeAbrirse(aInforme(null)), false);
  });
});
