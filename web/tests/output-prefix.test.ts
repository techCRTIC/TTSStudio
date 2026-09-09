import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { outputPrefix } from "../src/lib/tts.ts";

/**
 * `outputPrefix` — dónde deja el motor cada generación.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE (2026-09-09). Hasta ahora todo caía suelto en la
 * raíz de salida de ComfyUI y el prefijo era una constante, así que no había
 * nada que probar. Al pasar a `ttsstudio/<voz>/<fecha>/`, el identificador de
 * la voz —que **llega del navegador**— se convierte en una RUTA que el motor
 * crea en disco.
 *
 * Eso es una frontera de seguridad, no una cuestión de orden: la prueba que de
 * verdad importa aquí es que ninguna forma de `..` ni de barra sobreviva al
 * saneado.
 */

const CUANDO = new Date(2026, 8, 9, 15, 30); // 9 de septiembre de 2026, hora local

describe("la ruta que se construye", () => {
  test("carpeta propia, voz y fecha, en ese orden", () => {
    assert.equal(outputPrefix("martin_vega", CUANDO), "ttsstudio/martin_vega/2026-09-09/toma");
  });

  test("la extensión no es parte del nombre de la voz", () => {
    // El id de una voz clonada ES un nombre de archivo; una carpeta llamada
    // `martin_vega.safetensors` sería contarle al usuario un detalle interno.
    assert.equal(
      outputPrefix("martin_vega.safetensors", CUANDO),
      "ttsstudio/martin_vega/2026-09-09/toma",
    );
  });

  test("la fecha es LOCAL, no UTC", () => {
    // Una toma de las once de la noche pertenece a ese día para quien la hizo.
    // Con UTC habría caído en la carpeta del día siguiente.
    const nocheTarde = new Date(2026, 8, 9, 23, 45);
    assert.match(outputPrefix("v", nocheTarde), /\/2026-09-09\//);
  });
});

describe("el saneado: nada escribe fuera de la carpeta de salida", () => {
  test("un recorrido de directorios no sobrevive", () => {
    for (const ataque of [
      "../../../etc/passwd",
      "..\\..\\windows\\system32",
      "a/../../b",
      "....//....//x",
    ]) {
      const ruta = outputPrefix(ataque, CUANDO);
      assert.ok(!ruta.includes(".."), `«${ataque}» dejó pasar «..» -> ${ruta}`);
      // Exactamente cuatro tramos: ttsstudio / voz / fecha / toma. Uno de más
      // significa que un separador se coló dentro del nombre de la voz.
      assert.equal(ruta.split("/").length, 4, `«${ataque}» -> ${ruta}`);
    }
  });

  test("una barra dentro del nombre no crea un nivel nuevo", () => {
    assert.equal(outputPrefix("a/b/c", CUANDO).split("/").length, 4);
    assert.equal(outputPrefix("a\\b", CUANDO).split("/").length, 4);
  });

  test("un id vacío o inservible no deja la carpeta sin nombre", () => {
    // Sin esto saldría `ttsstudio//2026-09-09/`, que en disco es otra cosa.
    for (const vacio of ["", "...", "///", "___", "!!!"]) {
      const ruta = outputPrefix(vacio, CUANDO);
      assert.equal(ruta, "ttsstudio/voz/2026-09-09/toma", `con «${vacio}»`);
    }
  });

  test("las tildes y las mayúsculas no llegan al disco", () => {
    const ruta = outputPrefix("Andrés Núñez", CUANDO);
    assert.match(ruta, /^ttsstudio\/[a-z0-9_-]+\/2026-09-09\/toma$/);
  });

  test("un nombre larguísimo se recorta", () => {
    // Windows tiene un techo de ruta, y una carpeta de 300 caracteres deja
    // archivos que el explorador no puede ni borrar.
    const largo = "x".repeat(400);
    const voz = outputPrefix(largo, CUANDO).split("/")[1];
    assert.ok(voz.length <= 64, `quedó en ${voz.length} caracteres`);
  });
});
