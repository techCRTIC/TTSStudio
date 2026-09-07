/**
 * Editing a voice's provenance record. See ADR-005.
 *
 * WHY THIS ROUTE EXISTS SEPARATELY FROM REGISTRATION
 *   Because most voices that need a record are not being registered right now.
 *   `martin_vega.safetensors` was computed before this app existed; if
 *   provenance could only be captured at registration, the project's one real
 *   voice would stay blank forever and the feature would be invisible exactly
 *   where it matters. Provenance is also the kind of thing you write down after
 *   the fact — you get the person's permission in a conversation, not in a form.
 *
 * The voice id is checked against the ENGINE'S OWN LIST before any path is
 * built, the same posture the delete route takes: a value that is not a real
 * voice never reaches the filesystem layer.
 */

import { listVoices } from "@/lib/tts";
import { readSidecar, UnsafePathError, voiceSidecarPath, writeSidecar } from "@/lib/comfy-files";
import { parseProvenance, provenanceFromInput } from "@/lib/provenance";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return Response.json(
        { error: "bad_request", message: "El cuerpo de la petición no es JSON válido." },
        { status: 400 },
      );
    }

    const { voiceId, ...fields } = body as Record<string, unknown>;

    if (typeof voiceId !== "string" || !voiceId) {
      return Response.json(
        { error: "missing_id", message: "Falta decir de qué voz es esta procedencia." },
        { status: 400 },
      );
    }

    const existing = await listVoices();
    if (!existing.some((v) => v.id === voiceId)) {
      return Response.json(
        { error: "unknown_voice", message: "Esa voz ya no está en la biblioteca." },
        { status: 404 },
      );
    }

    const sidecarPath = voiceSidecarPath(voiceId);

    // The previous record is the fallback, and it is what protects the fields
    // the user is not editing: `registeredAt` must not reset to now on every
    // save, and `sampleFilename` is written by the preview route, never by an
    // edit — otherwise an edit could point the player at an arbitrary file.
    const previous = parseProvenance(await readSidecar(sidecarPath));

    let record;
    try {
      record = provenanceFromInput(fields, previous ?? undefined);
    } catch (cause) {
      return Response.json(
        {
          error: "invalid_provenance",
          message: cause instanceof Error ? cause.message : String(cause),
        },
        { status: 400 },
      );
    }

    // A voice documented for the first time gets "now" as its registration
    // date only if nothing better is known. Zero is kept as "unknown" rather
    // than quietly becoming today: claiming this voice was registered today
    // when it was computed months ago would be inventing provenance, which is
    // the one thing a provenance record must never do.
    await writeSidecar(sidecarPath, record);

    return Response.json({ voiceId, provenance: record });
  } catch (cause) {
    const status = cause instanceof UnsafePathError ? 400 : 502;
    return Response.json(
      {
        error: "provenance_save_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status },
    );
  }
}
