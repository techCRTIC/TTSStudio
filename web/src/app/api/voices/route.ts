import { listVoices } from "@/lib/tts";
import { registerVoice, voiceSlug } from "@/lib/voices";
import { deleteFile, UnsafePathError, voiceFilePath } from "@/lib/comfy-files";

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

/**
 * Step 2 of registering a voice: compute the embedding and save it.
 *
 * The transcript arrives already corrected by the user (step 1 produced a
 * draft; this is what they approved). Nothing is written to any registry —
 * Qwen3SavePrompt drops a .safetensors into the engine's prompts directory,
 * and GET above reports it from there on the next read. One source of truth.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return Response.json(
        { error: "bad_request", message: "El cuerpo de la petición no es JSON válido." },
        { status: 400 },
      );
    }

    const { audioFilename, refText, displayName, maxSeconds } = body as Record<string, unknown>;

    for (const [field, value] of Object.entries({ audioFilename, refText, displayName })) {
      if (typeof value !== "string" || !value.trim()) {
        return Response.json(
          { error: "missing_field", message: `Falta el campo "${field}".` },
          { status: 400 },
        );
      }
    }

    // Refuse a name that collides with a voice already on disk rather than
    // letting Qwen3SavePrompt overwrite it silently — a voice embedding is not
    // regenerable without the original clip.
    const slug = voiceSlug(displayName as string);
    const existing = await listVoices();
    if (existing.some((voice) => voice.id === `${slug}.safetensors`)) {
      return Response.json(
        {
          error: "voice_exists",
          message: `Ya existe una voz llamada "${displayName}". Elige otro nombre.`,
        },
        { status: 409 },
      );
    }

    const promptId = await registerVoice({
      audioFilename: audioFilename as string,
      refText: refText as string,
      displayName: displayName as string,
      maxSeconds: typeof maxSeconds === "number" ? maxSeconds : undefined,
    });

    // The caller polls /api/status/<promptId>; the voice appears in GET
    // /api/voices once the graph finishes.
    return Response.json({ promptId, voiceId: `${slug}.safetensors` }, { status: 202 });
  } catch (cause) {
    return Response.json(
      {
        error: "voice_registration_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}

/**
 * Delete a voice.
 *
 * ComfyUI has no route for this (its only DELETE is scoped to `user/`), so the
 * server removes the file itself. See ADR-004.
 *
 * The id is validated against the engine's OWN list before anything touches the
 * disk: an id that is not a real voice is refused outright, which means a
 * crafted value cannot reach the filesystem layer at all.
 */
export async function DELETE(request: Request) {
  try {
    const voiceId = new URL(request.url).searchParams.get("id") ?? "";

    if (!voiceId) {
      return Response.json(
        { error: "missing_id", message: "Falta decir qué voz borrar." },
        { status: 400 },
      );
    }

    const existing = await listVoices();
    const match = existing.find((v) => v.id === voiceId);
    if (!match) {
      return Response.json(
        { error: "unknown_voice", message: "Esa voz ya no está en la biblioteca." },
        { status: 404 },
      );
    }

    await deleteFile(voiceFilePath(voiceId));

    return Response.json({ deleted: voiceId, label: match.label });
  } catch (cause) {
    const status = cause instanceof UnsafePathError ? 400 : 502;
    return Response.json(
      {
        error: "voice_delete_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status },
    );
  }
}
