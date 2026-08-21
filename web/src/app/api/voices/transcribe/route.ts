/**
 * Step 1 of registering a voice: take the reference clip, put it where the
 * engine can read it, and come back with a transcript the user can correct.
 *
 * Deliberately NOT the same request as creating the voice. The transcript has
 * to be editable before it is committed — ASR mis-hears proper nouns, and
 * `ref_text` is load-bearing for the embedding, not a caption. See ADR-003.
 */

import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { transcribeFile, REF_AUDIO_MAX_SECONDS } from "@/lib/transcribe";
import { assertAudioFilename, uploadReferenceAudio } from "@/lib/voices";

export const dynamic = "force-dynamic";
// No `maxDuration` here on purpose: its own docs say it is "set by deployment
// platform", so it configures nothing in a locally-run app and would only read
// like a timeout that exists. The real bound is the spawn timeout inside
// transcribeFile().

/** Refuse absurd uploads before reading them into memory. */
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  let scratchFile: string | null = null;

  try {
    const form = await request.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      return Response.json(
        { error: "missing_audio", message: "No llegó ningún archivo de audio." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return Response.json(
        { error: "empty_audio", message: "El archivo de audio está vacío." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return Response.json(
        {
          error: "audio_too_large",
          message: `El audio pesa más de ${MAX_BYTES / 1024 / 1024} MB. Recórtalo antes de subirlo.`,
        },
        { status: 413 },
      );
    }

    assertAudioFilename(file.name);

    // Write the bytes once, then use that same file for both sides — the
    // transcript and the engine's copy come from identical bytes, so they
    // cannot describe different audio.
    const bytes = Buffer.from(await file.arrayBuffer());
    scratchFile = path.join(tmpdir(), `ttsstudio-${randomUUID()}${path.extname(file.name)}`);
    await writeFile(scratchFile, bytes);

    const audioFilename = await uploadReferenceAudio(file);
    const transcription = await transcribeFile(scratchFile, {
      maxSeconds: REF_AUDIO_MAX_SECONDS,
    });

    return Response.json({
      audioFilename,
      ...transcription,
      // Echoed so the create step can pass back the exact bound this
      // transcript was produced under. See ADR-003 § The trim contract.
      maxSeconds: REF_AUDIO_MAX_SECONDS,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return Response.json({ error: "transcription_failed", message }, { status: 502 });
  } finally {
    // The reference clip is someone's voice — personal data. The engine keeps
    // the copy it needs; this one goes, success or failure alike.
    if (scratchFile) await unlink(scratchFile).catch(() => {});
  }
}
