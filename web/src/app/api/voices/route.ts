import { listVoices } from "@/lib/tts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ voices: await listVoices() });
  } catch (cause) {
    return Response.json(
      {
        error: "comfy_unreachable",
        message: "No se pudo leer la biblioteca de voces. ¿ComfyUI está corriendo?",
        cause: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}
