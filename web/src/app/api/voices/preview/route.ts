/**
 * Hearing a voice without producing a take. See ADR-005.
 *
 * WHAT "LISTENING TO A VOICE" CAN EVEN MEAN HERE
 *   Not the reference clip: ADR-004 deletes it the moment the embedding exists,
 *   and the interface promises the user it did. Nor would it be the right thing
 *   to play — the clip is the real person, and what the app produces is the
 *   imitation. Choosing a voice by listening to the original is judging by the
 *   wrong sample.
 *
 *   So a preview is the engine saying a fixed sentence with that voice. The
 *   SAME sentence for every voice (`SAMPLE_TEXT`), because comparing two voices
 *   means hearing them say the same words.
 *
 * WHY IT IS GENERATED ON DEMAND AND THEN REMEMBERED
 *   Generating at registration time would lengthen the wait exactly when the
 *   user is watching the screen, and would spend a generation on every voice
 *   including the ones nobody ever plays. On demand costs nothing until someone
 *   is actually curious, and the result is cached in the sidecar so the wait
 *   happens once per voice, ever.
 */

import { listVoices, statusOf, submit, type Voice } from "@/lib/tts";
import { readSidecar, UnsafePathError, voiceSidecarPath, writeSidecar } from "@/lib/comfy-files";
import {
  parseProvenance,
  SAMPLE_MAX_TOKENS,
  SAMPLE_SEED,
  SAMPLE_TEXT,
} from "@/lib/provenance";

export const dynamic = "force-dynamic";

/**
 * Resolve a requested voice against the engine's own list.
 *
 * Returns the ENGINE'S ENTRY rather than the bare id, because the label it
 * derived from the filename ("Martin Vega") is the best name available for a
 * voice nobody has documented. Handing back only the id led to a real bug: the
 * preview wrote the raw slug as the display name, and since the library prefers
 * the recorded name over the derived one, PRESSING PLAY RENAMED THE VOICE —
 * "Alexander Frings" became "alexander_frings". Caught against the running
 * engine; no unit test would have seen it.
 */
async function knownVoiceOr404(voiceId: unknown): Promise<Response | Voice> {
  if (typeof voiceId !== "string" || !voiceId) {
    return Response.json(
      { error: "missing_id", message: "Falta decir qué voz escuchar." },
      { status: 400 },
    );
  }
  const match = (await listVoices()).find((v) => v.id === voiceId);
  if (!match) {
    return Response.json(
      { error: "unknown_voice", message: "Esa voz ya no está en la biblioteca." },
      { status: 404 },
    );
  }
  return match;
}

/** Start the sample generation. The caller polls /api/status/<promptId>. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const checked = await knownVoiceOr404(body?.voiceId);
    if (checked instanceof Response) return checked;

    const promptId = await submit(SAMPLE_TEXT, checked.id, SAMPLE_SEED, {
      maxNewTokens: SAMPLE_MAX_TOKENS,
    });

    return Response.json({ promptId, text: SAMPLE_TEXT }, { status: 202 });
  } catch (cause) {
    return Response.json(
      {
        error: "preview_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}

/**
 * Remember the sample that was just generated.
 *
 * ⚠️ THE CLIENT DOES NOT GET TO SAY WHICH FILE. It sends the prompt id, and the
 * server asks the ENGINE what that job produced. A browser-supplied filename
 * would be untrusted data landing in a record that later drives both a playback
 * URL and a delete — the same reason the delete route validates voice ids
 * against the engine's list instead of believing them.
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const checked = await knownVoiceOr404(body?.voiceId);
    if (checked instanceof Response) return checked;

    const promptId = body?.promptId;
    if (typeof promptId !== "string" || !promptId) {
      return Response.json(
        { error: "missing_prompt", message: "Falta decir qué generación fue." },
        { status: 400 },
      );
    }

    const status = await statusOf(promptId);
    if (status.state !== "done") {
      return Response.json(
        {
          error: "not_ready",
          message: "Esa generación todavía no ha producido audio.",
          state: status.state,
        },
        { status: 409 },
      );
    }

    const sidecarPath = voiceSidecarPath(checked.id);
    const previous = parseProvenance(await readSidecar(sidecarPath));

    // A voice with no record yet still gets its sample remembered: the preview
    // is about the voice, not about whether anyone documented it. The rest of
    // the record stays empty and honest — "sin procedencia registrada" — until
    // somebody fills it in.
    const record = {
      // The engine's label, not the raw filename: this record decides what the
      // library shows, so a placeholder here is a rename the user never asked
      // for.
      displayName: previous?.displayName || checked.label,
      registeredAt: previous?.registeredAt ?? 0,
      source: previous?.source ?? "pre-existing",
      refSeconds: previous?.refSeconds ?? 0,
      note: previous?.note ?? "",
      sampleFilename: status.filename,
    };

    await writeSidecar(sidecarPath, record);

    return Response.json({ voiceId: checked.id, sampleUrl: status.audioUrl });
  } catch (cause) {
    const status = cause instanceof UnsafePathError ? 400 : 502;
    return Response.json(
      {
        error: "preview_save_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status },
    );
  }
}
