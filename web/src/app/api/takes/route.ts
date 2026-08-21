/**
 * Deleting a generated take's audio from disk.
 *
 * The history itself lives in the browser (localStorage), so removing an entry
 * there is the client's job. This route is the other half: the actual .flac in
 * ComfyUI's output directory, which nothing else would ever clean up.
 *
 * ComfyUI offers no route for it — see ADR-004 — so the server does it.
 */

import { deleteFile, outputFilePath, UnsafePathError } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const filename = params.get("filename") ?? "";
    const subfolder = params.get("subfolder") ?? "";
    // Defaults to "output" and is then verified: only an output is ours to
    // delete. An input is somebody's reference recording.
    const type = params.get("type") ?? "output";

    if (!filename) {
      return Response.json(
        { error: "missing_filename", message: "Falta decir qué archivo borrar." },
        { status: 400 },
      );
    }

    await deleteFile(outputFilePath({ filename, subfolder, type }));

    return Response.json({ deleted: filename });
  } catch (cause) {
    const status = cause instanceof UnsafePathError ? 400 : 502;
    return Response.json(
      {
        error: "take_delete_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status },
    );
  }
}
