/**
 * Instala UNA dependencia, contando cómo va mientras lo hace.
 *
 * POR QUÉ ESTO ES UNA RESPUESTA EN STREAMING Y NO UN TRABAJO EN EL SERVIDOR
 * (ADR-008 D4, enmendado): el plan original guardaba la descarga en un almacén
 * de trabajos para que sobreviviera a cerrar la pestaña. Se recortó por pedido
 * expreso: la descarga vive con la página, y si se cierra, se corta y se
 * reintenta. Eso quitó el almacén, su ciclo de vida y sus caminos de
 * recuperación — la mitad de la complejidad del portal.
 *
 * Es seguro cortarla por una única razón: el script descarga a una carpeta
 * temporal y solo le pone el nombre bueno con un renombrado atómico al final
 * (D5). Una descarga abandonada nunca se confunde con un modelo instalado.
 *
 * Lo que sale por aquí es NDJSON: una línea de JSON por novedad. No es SSE ni
 * websocket a propósito; el navegador solo tiene que ir leyendo líneas.
 *
 * ESTA RUTA NO AFIRMA QUE ALGO QUEDÓ INSTALADO (D6). Dice cómo fue el intento.
 * Quien decide si quedó es la re-auditoría que el cliente pide después, y esa
 * es la única que la pantalla cree.
 */

import { spawn } from "node:child_process";

import { projectRoot, stdlibPython } from "@/lib/python";

export const dynamic = "force-dynamic";

/**
 * Qué se ejecuta para cada cosa, y NADA MÁS que esto.
 *
 * Es una tabla cerrada a propósito (ADR-008 D10): del navegador llega una
 * clave, nunca una ruta ni un argumento. El id no se concatena en ningún
 * comando — se busca aquí, y si no está, no pasa nada.
 *
 * `comfyui-corriendo` tiene DOS entradas porque son dos cosas distintas:
 * arrancar un motor que ya está instalado, o instalarlo primero. Ofrecer una
 * descarga de varios GB a quien ya lo tiene en disco sería un error caro.
 */
const ACCIONES: Record<string, { script: string; args: string[] }> = {
  "pack-qwen3-tts": { script: "instalar_dependencia.py", args: ["--requisito", "pack-qwen3-tts"] },
  "modelo-base": { script: "instalar_dependencia.py", args: ["--requisito", "modelo-base"] },
  "voces-preestablecidas": {
    script: "instalar_dependencia.py",
    args: ["--requisito", "voces-preestablecidas"],
  },
  reescritura: { script: "instalar_dependencia.py", args: ["--requisito", "reescritura"] },
  transcripcion: { script: "instalar_dependencia.py", args: ["--requisito", "transcripcion"] },
  "entorno-python": { script: "crear_entorno.py", args: [] },
  arrancar: { script: "arrancar_comfy.py", args: ["--arrancar"] },
  "instalar-comfyui": { script: "arrancar_comfy.py", args: ["--instalar"] },
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    accion?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";

  // D10, la puerta de seguridad: el id se compara contra una lista cerrada
  // ANTES de tocar un proceso. Nada que venga del navegador llega a formar
  // parte de un comando — el script recibe un id, no una ruta ni una URL, y
  // resuelve el resto contra el manifiesto versionado.
  // La acción manda cuando viene (el motor tiene dos); si no, el id es la clave.
  const accion = typeof body?.accion === "string" ? body.accion : "";
  const tarea = ACCIONES[accion] ?? ACCIONES[id];
  if (!tarea) {
    return Response.json({ error: "id_no_instalable" }, { status: 400 });
  }

  // ADR-008 D8, y aqui faltaba: la pantalla que arregla dependencias no puede
  // necesitar una. `pythonPath` LANZA si no encuentra el entorno del proyecto,
  // y esa llamada estaba fuera de todo resguardo — en una maquina sin `.venv`,
  // que es justo el usuario nuevo al que sirve este portal, el boton devolvia
  // un 500 sin explicar nada. La ruta de auditoria si se protegia; esta no.
  // El instalador es stdlib pura, así que NO exige el entorno del proyecto: en
  // una instalación recién hecha no existe, y esa es justo la máquina para la
  // que este portal existe (ADR-009 D6.2). Si no hay ningún Python, se dice.
  const root = projectRoot();
  const interprete = stdlibPython(root);
  if (interprete === null) {
    return Response.json(
      {
        error: "sin_python",
        mensaje:
          "No se encontró ningún Python en esta máquina. Instálalo desde " +
          "python.org y vuelve a abrir la app.",
      },
      { status: 503 },
    );
  }

  const hijo = spawn(
    interprete,
    [`execution/${tarea.script}`, ...tarea.args],
    { cwd: root, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
  );

  const encoder = new TextEncoder();
  let errores = "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cerrado = false;
      const cerrar = () => {
        if (!cerrado) {
          cerrado = true;
          try {
            controller.close();
          } catch {
            /* ya estaba cerrado */
          }
        }
      };

      hijo.stdout.on("data", (trozo: Buffer) => {
        if (!cerrado) controller.enqueue(encoder.encode(trozo.toString("utf8")));
      });

      // stderr NO se reenvía al navegador: puede traer rutas de la máquina.
      // Se guarda por si el proceso muere sin decir nada por stdout.
      hijo.stderr.on("data", (trozo: Buffer) => {
        errores += trozo.toString("utf8");
      });

      hijo.on("error", (e: Error) => {
        if (!cerrado) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ tipo: "fin", ok: false, mensaje: `No se pudo arrancar el instalador: ${e.message}` }) + "\n",
            ),
          );
        }
        cerrar();
      });

      hijo.on("close", (code) => {
        // Un proceso que muere sin haber dicho "fin" dejaría al navegador
        // esperando para siempre una línea que no llega.
        if (!cerrado && code !== 0 && errores.trim().length > 0) {
          const ultima = errores.trim().split("\n").pop() ?? "";
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ tipo: "fin", ok: false, mensaje: `El instalador falló: ${ultima}` }) + "\n",
            ),
          );
        }
        cerrar();
      });

      // Cerrar la pestaña aborta la petición: se mata el proceso en vez de
      // dejarlo descargando gigabytes que ya no mira nadie.
      request.signal.addEventListener("abort", () => {
        hijo.kill();
        cerrar();
      });
    },
    cancel() {
      hijo.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Sin esto, un proxy intermedio puede acumular la respuesta entera y
      // entregarla de golpe al final — que es exactamente no tener progreso.
      "X-Accel-Buffering": "no",
    },
  });
}
