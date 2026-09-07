/**
 * Abrir el explorador de archivos con la toma seleccionada.
 *
 * POR QUÉ EXISTE: el audio no vive dentro del proyecto, vive en la carpeta de
 * salida de ComfyUI, y el `README` tiene que explicar dónde. Un botón que te
 * lleva ahí convierte esa explicación en un gesto.
 *
 * LA RUTA NUNCA VIENE DEL NAVEGADOR. Llega un nombre de archivo y lo resuelve
 * `outputFilePath`, que es el único módulo que calcula rutas legales (ADR-004)
 * y valla el resultado dentro del directorio de salida. Esto importa más aquí
 * que en las otras rutas: lo que sale de esta función va a un proceso del
 * sistema operativo, así que una ruta con truco no leería un archivo ajeno —
 * abriría una ventana en él.
 *
 * SE COMPRUEBA QUE EL ARCHIVO EXISTE ANTES DE ABRIR NADA. El historial guarda
 * un enlace, no el audio: si alguien vació la carpeta de ComfyUI, la toma sigue
 * en la lista y el archivo no está. Abrir el explorador en una carpeta y dejar
 * que el usuario busque algo que no existe es peor que decírselo.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { outputFilePath, redactRoot } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    filename?: unknown;
    subfolder?: unknown;
  } | null;

  const filename = typeof body?.filename === "string" ? body.filename : "";
  const subfolder = typeof body?.subfolder === "string" ? body.subfolder : "";

  if (!filename) {
    return Response.json({ error: "sin_archivo" }, { status: 400 });
  }

  let ruta: string;
  try {
    ruta = outputFilePath({ filename, subfolder });
  } catch {
    return Response.json({ error: "ruta_invalida" }, { status: 400 });
  }

  if (!existsSync(ruta)) {
    return Response.json(
      {
        error: "no_existe",
        mensaje:
          "El archivo ya no está en el disco. El historial guarda el texto y un " +
          "enlace, no el audio: si vaciaste la carpeta de salida de ComfyUI, la " +
          "toma sigue en la lista pero su audio no.",
      },
      { status: 404 },
    );
  }

  try {
    if (process.platform === "win32") {
      // `/select,` va PEGADO a la ruta y como UN solo argumento: separarlos
      // abre la carpeta de Documentos en vez de la que se pide.
      //
      // Y explorer.exe devuelve 1 aunque haya funcionado, así que su código de
      // salida no se mira. Mirarlo daría un error en la cara del usuario justo
      // después de que la ventana se abriera delante de él.
      spawn("explorer.exe", [`/select,${ruta}`], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", ["-R", ruta], { detached: true, stdio: "ignore" }).unref();
    } else {
      // En Linux no hay un «seleccionar el archivo» portable, así que se abre
      // la carpeta. Menos preciso, y honesto: no se promete lo que no se hace.
      spawn("xdg-open", [path.dirname(ruta)], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (error) {
    return Response.json(
      {
        error: "no_se_pudo_abrir",
        // La ruta de la máquina no viaja al navegador sin limpiar: el mensaje
        // de un error del sistema puede traerla entera dentro.
        mensaje: redactRoot(error instanceof Error ? error.message : "No se pudo abrir la carpeta."),
      },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
