/**
 * Qué le falta a esta máquina. La pregunta que abre el portal (ADR-008).
 *
 * Responde siempre, incluso cuando no puede auditar: un portal que devuelve un
 * error en vez de un informe deja al usuario nuevo — que es justo su público —
 * con una pantalla en blanco y ninguna pista. Si la auditoría no corre, el
 * informe sale vacío con `disponible: false`, y la pantalla lo dice con
 * palabras.
 */

import { runScriptJson } from "@/lib/python";
import { aInforme, type InformeSetup } from "@/lib/setup";

/**
 * Corre la auditoría. Vive aquí, y no en `lib/setup`, porque `lib/setup` lo
 * importa el navegador: bajar el puente de Python un piso más allí dentro
 * arrastraría `child_process` al paquete del cliente y la compilación se cae.
 *
 * El plazo es generoso a propósito: con ComfyUI apagado la auditoría tarda unos
 * milisegundos, pero con el motor vivo consulta sus nodos por HTTP.
 */
async function auditar(): Promise<InformeSetup> {
  const { data } = await runScriptJson<unknown>("auditar_host.py", ["--app"], {
    timeoutMs: 30_000,
    // El auditor es stdlib pura, así que corre sin el entorno del proyecto.
    // Sin esto, la pantalla que arregla dependencias necesitaría una de ellas
    // para arrancar (ADR-008 D8, ADR-009 D6.2).
    stdlibOnly: true,
  });
  return aInforme(data);
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const informe = await auditar();
    return Response.json({ disponible: true, informe });
  } catch (error) {
    // D8: la pantalla que arregla dependencias no puede necesitar una. Si falta
    // Python, esto es exactamente lo que pasa, y hay que decirlo, no romperse.
    const motivo = error instanceof Error ? error.message : "motivo desconocido";
    return Response.json({
      disponible: false,
      motivo,
      informe: {
        workspace: null,
        comfyui_url: null,
        comfyui_corriendo: false,
        disco_libre_mb: null,
        requisitos: [],
      },
    });
  }
}
