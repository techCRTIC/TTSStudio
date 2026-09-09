/**
 * Qué audio hay ya en el disco que la app no conoce.
 *
 * POR QUÉ EXISTE: el historial vive en el navegador y los audios en la carpeta
 * de salida de ComfyUI. Son dos mitades que pueden separarse — audio generado
 * antes de que existiera el historial, generado desde ComfyUI directamente, o
 * traído de otra máquina. Regenerarlo sería pagar dos veces por lo mismo.
 *
 * SOLO MIRA DENTRO DE LA CARPETA DE SALIDA, y no es una limitación que se pueda
 * levantar: la app sirve el audio a través de `/api/comfy/view`, que solo lee de
 * ahí. Un archivo de fuera aparecería en la lista y no sonaría, que es peor que
 * no aparecer. Quien tenga audio en otro sitio tiene que moverlo primero.
 *
 * NO ESCRIBE NADA. Devuelve lo que hay; quien decide qué se queda en el
 * historial es el navegador, que es donde el historial vive.
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { DIRECTORIES, redactRoot } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

/** Lo que el motor sabe escribir, y lo que un navegador sabe reproducir. */
const EXTENSIONES = new Set([".flac", ".wav", ".mp3", ".ogg", ".opus", ".m4a"]);

/**
 * Hasta dónde se baja.
 *
 * `ttsstudio/<voz>/<fecha>/` son tres niveles, así que cuatro deja margen sin
 * convertir esto en un recorrido del disco entero. La carpeta de salida de
 * ComfyUI es de alguien más: puede tener dentro cualquier cosa.
 */
const PROFUNDIDAD = 4;

/** Ni un directorio gigante puede hacer que esta ruta no termine nunca. */
const TOPE = 2000;

type Hallazgo = {
  filename: string;
  subfolder: string;
  modifiedAt: number;
  sizeBytes: number;
};

async function recorrer(
  raiz: string,
  relativa: string,
  profundidad: number,
  salida: Hallazgo[],
): Promise<void> {
  if (profundidad > PROFUNDIDAD || salida.length >= TOPE) return;

  let entradas;
  try {
    entradas = await readdir(path.join(raiz, relativa), { withFileTypes: true });
  } catch {
    // Una carpeta ilegible no es motivo para no devolver el resto.
    return;
  }

  for (const entrada of entradas) {
    if (salida.length >= TOPE) return;
    if (entrada.name.startsWith(".")) continue;

    const relHijo = relativa ? `${relativa}/${entrada.name}` : entrada.name;

    if (entrada.isDirectory()) {
      await recorrer(raiz, relHijo, profundidad + 1, salida);
      continue;
    }
    if (!entrada.isFile()) continue;
    if (!EXTENSIONES.has(path.extname(entrada.name).toLowerCase())) continue;

    // Una descarga a medias o un archivo vacío no es una toma.
    try {
      const info = await stat(path.join(raiz, relHijo));
      if (info.size === 0) continue;
      salida.push({
        filename: entrada.name,
        subfolder: relativa,
        modifiedAt: info.mtimeMs,
        sizeBytes: info.size,
      });
    } catch {
      continue;
    }
  }
}

export async function GET() {
  try {
    const raiz = DIRECTORIES.OUTPUT_DIR;
    const encontrados: Hallazgo[] = [];
    await recorrer(raiz, "", 0, encontrados);

    // Lo más nuevo primero: es el orden en el que el historial se lee, y el
    // orden en el que a alguien le importa lo que encontró.
    encontrados.sort((a, b) => b.modifiedAt - a.modifiedAt);

    return Response.json({ files: encontrados, truncated: encontrados.length >= TOPE });
  } catch (error) {
    return Response.json(
      {
        error: "no_se_pudo_leer",
        // La ruta de la máquina no viaja al navegador sin limpiar.
        mensaje: redactRoot(error instanceof Error ? error.message : String(error)),
      },
      { status: 502 },
    );
  }
}
