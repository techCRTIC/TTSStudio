/**
 * Traer archivos de voz que están en otra carpeta.
 *
 * POR QUÉ HACE FALTA, SIENDO QUE LAS VOCES EN DISCO YA APARECEN: la lista de
 * voces clonadas NO la mantiene esta app — la da el propio ComfyUI, leyendo su
 * carpeta `models/Qwen3-TTS/prompts/`. Un `.safetensors` que ya esté ahí sale
 * en la app sin que nadie haga nada.
 *
 * Lo que no puede pasar solo es que un archivo que vive en OTRA carpeta —una
 * copia de seguridad, otra máquina, un disco externo— llegue hasta ahí. Eso es
 * lo único que hace esta ruta: copiarlo al sitio donde el motor mira.
 *
 * NO SE INVENTA PROCEDENCIA. Una voz registrada desde la app guarda a su lado
 * de quién es y con qué permiso (ADR-005). De un archivo traído de fuera no se
 * sabe nada de eso, y rellenarlo con algo plausible convertiría el campo que
 * existe para el consentimiento en un campo decorativo. Llegan sin sidecar, y
 * la app las muestra como «sin procedencia registrada», que es la verdad.
 */

import { writeFile } from "node:fs/promises";

import { redactRoot, UnsafePathError, voiceFilePath } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

/** Lo único que el nodo del motor sabe cargar. */
const EXTENSION = ".safetensors";

/** Una voz clonada pesa cientos de KB, no cientos de MB. */
const MAX_BYTES = 64 * 1024 * 1024;

export async function POST(request: Request) {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return Response.json({ error: "peticion_invalida" }, { status: 400 });
  }

  const archivos = formulario.getAll("voces").filter((v): v is File => v instanceof File);
  if (archivos.length === 0) {
    return Response.json({ error: "sin_archivos" }, { status: 400 });
  }

  const traidas: string[] = [];
  const rechazadas: { nombre: string; motivo: string }[] = [];

  for (const archivo of archivos) {
    const nombre = archivo.name;

    if (!nombre.toLowerCase().endsWith(EXTENSION)) {
      rechazadas.push({ nombre, motivo: `No es un ${EXTENSION}` });
      continue;
    }
    if (archivo.size === 0) {
      rechazadas.push({ nombre, motivo: "Está vacío" });
      continue;
    }
    if (archivo.size > MAX_BYTES) {
      rechazadas.push({ nombre, motivo: "Pesa demasiado para ser una voz" });
      continue;
    }

    try {
      // `voiceFilePath` es el único módulo que calcula rutas legales (ADR-004):
      // el nombre llega del navegador y aquí se vuelve una ruta de escritura,
      // así que no se construye a mano ni una sola vez.
      const destino = voiceFilePath(nombre);
      await writeFile(destino, Buffer.from(await archivo.arrayBuffer()));
      traidas.push(nombre);
    } catch (cause) {
      rechazadas.push({
        nombre,
        motivo:
          cause instanceof UnsafePathError
            ? "El nombre del archivo no es válido"
            : redactRoot(cause instanceof Error ? cause.message : String(cause)),
      });
    }
  }

  // 200 aunque alguna se rechace: la respuesta dice qué pasó con cada una, y un
  // código de error escondería las que sí entraron.
  return Response.json({ traidas, rechazadas });
}
