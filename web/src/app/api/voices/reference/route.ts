/**
 * Removing a reference clip once the voice has been computed from it.
 *
 * The clip is a real person's voice. The moment the .safetensors exists, the
 * embedding is what the app uses and the recording has served its purpose — so
 * keeping it is holding personal data for no reason, which CLAUDE.md
 * § Retention says not to do. It matters more now that the app can record
 * straight from the microphone: without this, every registration would leave
 * another recording of somebody in ComfyUI's input folder forever.
 *
 * Called after registration succeeds, and best-effort by design: the voice
 * already exists, so a failure here is worth reporting but must never read as
 * "the voice was not created".
 */

import { deleteFile, referenceFilePath, UnsafePathError } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const filename = new URL(request.url).searchParams.get("filename") ?? "";

    if (!filename) {
      return Response.json(
        { error: "missing_filename", message: "Falta decir qué audio borrar." },
        { status: 400 },
      );
    }

    await deleteFile(referenceFilePath(filename));

    return Response.json({ deleted: filename });
  } catch (cause) {
    const status = cause instanceof UnsafePathError ? 400 : 502;
    return Response.json(
      {
        error: "reference_delete_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status },
    );
  }
}
