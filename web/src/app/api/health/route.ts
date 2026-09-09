/**
 * ¿Está en pie el servidor de la app? Solo eso.
 *
 * POR QUÉ EXISTE, Y ES UN ARREGLO, NO UN ADORNO (2026-09-09)
 *   El lanzador esperaba a que `/api/voices` respondiera para dar la app por
 *   arrancada. Pero esa ruta **pregunta por ComfyUI**, y devuelve 502 cuando el
 *   motor no está. En el `.exe`, con ComfyUI apagado, la consecuencia era que
 *   la aplicación esperaba un minuto y **se cerraba sola** con un «la app no
 *   arrancó» — cuando la app estaba perfectamente arrancada y lo único ausente
 *   era el motor.
 *
 *   Es decir: la comprobación de vida preguntaba por otra cosa, y mataba al
 *   paciente por el resultado.
 *
 * ESTA RUTA NO SABE NADA DEL MOTOR, Y NO DEBE SABERLO.
 *   Es deliberado hasta el punto de ser el contrato: si algún día alguien le
 *   añade una comprobación de ComfyUI «para que sea más completa», vuelve el
 *   mismo fallo. Quien quiera saber del motor tiene `/api/setup/audit`.
 *
 *   Por la misma razón no toca disco, ni lanza procesos, ni lee configuración:
 *   cualquier cosa que pueda fallar aquí es una cosa que puede impedir que la
 *   ventana se abra.
 */

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
