import { listVoices, type VoiceKind } from "@/lib/tts";
import { registerVoice, voiceSlug } from "@/lib/voices";
import {
  CUSTOM_VOICE_MODEL_DIR,
  deleteFile,
  hasEngineModel,
  outputFilePath,
  readSidecar,
  UnsafePathError,
  voiceFilePath,
  voiceSidecarPath,
  writeSidecar,
} from "@/lib/comfy-files";
import { parseProvenance, provenanceFromInput, type Provenance } from "@/lib/provenance";

export const dynamic = "force-dynamic";

/** A voice as the interface sees it: the engine's entry plus its record, if any. */
export type VoiceWithProvenance = {
  id: string;
  label: string;
  /** "cloned" belongs to a person; "preset" is one of the model's own. */
  kind: VoiceKind;
  provenance: Provenance | null;
  /** Where the cached preview can be played from, if one was ever generated. */
  sampleUrl: string | null;
};

/** The engine's `view` route, proxied. Same shape the generation flow returns. */
function sampleUrlFor(filename: string): string {
  return `/api/comfy/view?filename=${encodeURIComponent(filename)}&subfolder=&type=output`;
}

/**
 * The voice library.
 *
 * ⚠️ THE ENGINE IS STILL THE LIST (ADR-005). `listVoices()` decides which
 * voices exist; the sidecar only decorates entries that are already there. A
 * sidecar with no voice is never read, so it cannot invent one, and a voice
 * with no sidecar is reported honestly as undocumented rather than hidden.
 *
 * The label prefers the recorded name because the slug destroys accents:
 * "Martín Vega" becomes `martin_vega`, and `labelFor` can only ever bring back
 * "Martin Vega". The sidecar is the only place the real spelling survives.
 */
export async function GET() {
  try {
    const all = await listVoices();

    /**
     * The nine preset speakers live inside a checkpoint of their own
     * (`-CustomVoice`), separate from the `-Base` one cloning uses, and it is
     * a separate multi-gigabyte download. Listing them without it produced the
     * engine's own "incompatible model" error at generation time — the
     * interface promising something it could not deliver, which PRODUCT.md's
     * second principle forbids.
     *
     * So they are simply not offered until the model is there. Offering them
     * greyed out, with what to download and how big it is, is the job of the
     * installer surface in the backlog, not of this route.
     */
    const presetsReady = hasEngineModel(CUSTOM_VOICE_MODEL_DIR);
    const voices = presetsReady ? all : all.filter((voice) => voice.kind !== "preset");

    const withProvenance: VoiceWithProvenance[] = await Promise.all(
      voices.map(async (voice) => {
        // A preset has no sidecar and never will: it is not a recording of
        // anybody, it is a speaker inside the model's weights. Looking one up
        // would be a guaranteed miss, and reporting it as "sin procedencia
        // registrada" — the honest answer for a CLONE with no record — would
        // read as an oversight about a person who does not exist.
        if (voice.kind === "preset") {
          return { id: voice.id, label: voice.label, kind: voice.kind, provenance: null, sampleUrl: null };
        }

        // A malformed sidecar costs a decoration and nothing else — readSidecar
        // and parseProvenance both degrade to null rather than throwing, so one
        // hand-edited file cannot take down the library.
        let provenance: Provenance | null = null;
        try {
          provenance = parseProvenance(await readSidecar(voiceSidecarPath(voice.id)));
        } catch {
          provenance = null;
        }

        return {
          id: voice.id,
          label: provenance?.displayName || voice.label,
          kind: voice.kind,
          provenance,
          sampleUrl: provenance?.sampleFilename
            ? sampleUrlFor(provenance.sampleFilename)
            : null,
        };
      }),
    );

    // Reported rather than silent: the client can say why nine voices the
    // user may have seen mentioned are not in the list.
    return Response.json({ voices: withProvenance, presetsReady });
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
 * draft; this is what they approved). It is used and then dropped — ADR-005 is
 * explicit that the transcript is NOT part of the provenance record.
 *
 * The sidecar is written here, before the graph finishes, and that is safe by
 * the reconciliation rule: a sidecar with no voice yet is simply ignored, and
 * it is waiting when the .safetensors lands. The alternative — a second round
 * trip once the job completes — buys nothing and can be lost if the browser
 * closes mid-job.
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

    const { audioFilename, refText, displayName, maxSeconds, source, note } =
      body as Record<string, unknown>;

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
    const voiceId = `${slug}.safetensors`;
    const existing = await listVoices();
    if (existing.some((voice) => voice.id === voiceId)) {
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

    // Provenance is written best-effort: the voice is what the user asked for,
    // and a record that failed to save is worth reporting but must never read
    // as "the voice was not created". It can be filled in from the interface.
    let provenanceSaved = true;
    try {
      await writeSidecar(
        voiceSidecarPath(voiceId),
        provenanceFromInput({
          displayName: displayName as string,
          registeredAt: Date.now(),
          source,
          refSeconds: maxSeconds,
          note,
        }),
      );
    } catch {
      provenanceSaved = false;
    }

    // The caller polls /api/status/<promptId>; the voice appears in GET
    // /api/voices once the graph finishes.
    return Response.json({ promptId, voiceId, provenanceSaved }, { status: 202 });
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
 * Delete a voice — and everything that only existed to describe it.
 *
 * Three files, in the order that fails safest. The embedding goes first because
 * it is the thing the user asked to destroy and the only one that is not
 * regenerable; if it survives, nothing else should be removed either. The
 * sidecar and the cached sample follow best-effort: once the voice is gone they
 * describe nothing, and a failure to tidy them up must not report as a failed
 * delete of a voice that IS gone.
 *
 * ComfyUI has no route for any of this (its only DELETE is scoped to `user/`),
 * so the server removes the files itself. See ADR-004.
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

    // Read the record BEFORE deleting it: it is the only thing that knows
    // whether a cached sample exists, and where.
    const sidecarPath = voiceSidecarPath(voiceId);
    const provenance = parseProvenance(await readSidecar(sidecarPath));

    await deleteFile(voiceFilePath(voiceId));

    // Both are best-effort, and the try/catch has to WRAP the path building,
    // not just the delete: `outputFilePath` throws synchronously on a bad
    // filename, so a `.catch()` on its result never sees it. A sidecar
    // hand-edited to point outside the output directory would then abort a
    // delete whose voice is already gone, and report failure for something
    // that succeeded.
    try {
      await deleteFile(sidecarPath);
    } catch {
      // The voice is gone; an orphan record describing nothing is not worth
      // failing the request over.
    }

    if (provenance?.sampleFilename) {
      try {
        await deleteFile(outputFilePath({ filename: provenance.sampleFilename }));
      } catch {
        // Same, plus: an UnsafePathError here means the sidecar was tampered
        // with. Refusing to follow it is the correct outcome, and it must not
        // become the caller's problem.
      }
    }

    return Response.json({ deleted: voiceId, label: provenance?.displayName ?? match.label });
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
