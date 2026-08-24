/**
 * Deleting a generated take's audio from disk.
 *
 * The history itself lives in the browser (localStorage), so removing an entry
 * there is the client's job. This route is the other half: the actual .flac in
 * ComfyUI's output directory, which nothing else would ever clean up.
 *
 * ComfyUI offers no route for it — see ADR-004 — so the server does it.
 *
 * TWO SHAPES, ONE ROUTE
 *   A normal take is exactly one file, and that path is untouched: query
 *   params (`filename`/`subfolder`/`type`), one `deleteFile()` call, the same
 *   `{ deleted: filename }` reply it always returned. Callers that already
 *   exist — `deleteTake()` in `@/lib/history` — keep working with zero changes.
 *
 *   A long-script take is N segment files plus the joined piece: deleting
 *   "this take" means deleting N+1 files, not one. That shape is a JSON body
 *   (`{ files: [{filename, subfolder?, type?}, ...] }`) on the very same
 *   DELETE route. The discriminator is the `Content-Type` header: the
 *   single-file path never sends a body, so it never sends
 *   `application/json` either — there is no ambiguity, and no existing
 *   caller can accidentally cross into the batch path.
 *
 *   Batch semantics on purpose:
 *     1. Every path is resolved AND validated with `outputFilePath()` before
 *        anything is deleted — a bad entry at position 3 must not have
 *        already deleted positions 1 and 2 by the time it's caught.
 *     2. Deletion then happens one file at a time.
 *     3. The reply reports success or failure PER FILE
 *        (`{ results: [{filename, deleted, error?}, ...] }`), never a single
 *        boolean. A partial failure — e.g. a permissions error on segment 3
 *        of 6 — must be visible to the caller, not swallowed, so the client
 *        can say "these two didn't delete" instead of silently orphaning
 *        them. HTTP status mirrors that: 200 only if every file in the batch
 *        deleted; 207 (Multi-Status) the moment even one did not, whether
 *        the rest succeeded or the whole batch failed.
 *
 *   NOTE for whoever wires the client side of long scripts: `deleteTake()` in
 *   `@/lib/history` will need to start calling this widened contract once the
 *   `Take` type gains segment information, so a "take" made of N+1 files can
 *   be deleted in one request instead of N+1 round trips. That update belongs
 *   to frontend-lead — out of scope here, which only widens the route.
 */

import { deleteFile, outputFilePath, UnsafePathError } from "@/lib/comfy-files";

export const dynamic = "force-dynamic";

/** One entry of a batch delete request, as sent by the client. */
/**
 * The most files one batch delete may name.
 *
 * A long take is its segments plus the joined piece — tens, never hundreds.
 * 200 mirrors the history's own take ceiling (`web/src/lib/history.ts`).
 */
const MAX_BATCH_FILES = 200;

type BatchDeleteRequestItem = {
  filename: string;
  subfolder?: string;
  type?: string;
};

/**
 * The per-file outcome reported back for a batch delete.
 *
 * `index` is the item's position in the REQUEST, and it is what makes the
 * correspondence total: two segments of the same long take can share a
 * `filename` in different subfolders, and without the index the caller cannot
 * tell which of the two failed — it would report "deleted" for a file still on
 * disk. `subfolder` is echoed for the same reason, so a human reading the
 * response does not have to count positions.
 */
type BatchDeleteResult =
  | { index: number; filename: string; subfolder: string; deleted: true }
  | { index: number; filename: string; subfolder: string; deleted: false; error: string };

/**
 * A batch item after path resolution: either a real path proven to sit
 * inside the output directory, or the reason it couldn't be resolved.
 *
 * Kept distinct from `BatchDeleteResult` because resolution and deletion are
 * two separate phases — the whole point of validating everything up front —
 * even though both end up reported the same shape.
 */
type ResolvedBatchItem =
  | { index: number; filename: string; subfolder: string; path: string }
  | { index: number; filename: string; subfolder: string; error: string };

export async function DELETE(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    return deleteBatch(request);
  }
  return deleteSingle(request);
}

/** The original, unwidened contract: exactly one file, from query params. */
async function deleteSingle(request: Request): Promise<Response> {
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

/**
 * The widened contract: many files, one request, per-file reporting.
 *
 * Malformed request shape (bad JSON, no `files` array, an empty list) is
 * rejected wholesale with 400 — there is nothing per-file to report because
 * nothing was attempted yet. Once the list is well-formed, every item gets
 * its own outcome; a bad item never takes the batch down with it.
 */
async function deleteBatch(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const rawFiles = body && typeof body === "object" ? (body as Record<string, unknown>).files : null;

  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return Response.json(
      {
        error: "missing_files",
        message: "Falta la lista de archivos a borrar (\"files\").",
      },
      { status: 400 },
    );
  }

  // A long take is its segments plus the joined piece — tens of files, never
  // hundreds. The cap matches the history's own 200-take ceiling and exists so
  // one malformed request cannot ask the server to walk an unbounded list of
  // deletions.
  if (rawFiles.length > MAX_BATCH_FILES) {
    return Response.json(
      {
        error: "too_many_files",
        message: `Son ${rawFiles.length} archivos y el máximo por petición es ${MAX_BATCH_FILES}.`,
      },
      { status: 400 },
    );
  }

  // Phase 1: resolve and validate EVERY path before deleting ANYTHING. A
  // traversal attempt or a missing filename at position 3 must be caught
  // before positions 1 and 2 are ever touched.
  const resolved: ResolvedBatchItem[] = rawFiles.map((raw, index): ResolvedBatchItem => {
    const item = readBatchItem(raw);
    const subfolder = "subfolder" in item ? (item.subfolder ?? "") : "";
    if ("error" in item) return { index, filename: item.filename, subfolder, error: item.error };
    try {
      return { index, filename: item.filename, subfolder, path: outputFilePath(item) };
    } catch (cause) {
      return {
        index,
        filename: item.filename,
        subfolder,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });

  // Phase 2: delete one at a time. Items that failed resolution are reported
  // as failures without ever reaching `deleteFile()`.
  const results: BatchDeleteResult[] = [];
  for (const item of resolved) {
    const { index, filename, subfolder } = item;
    if ("error" in item) {
      results.push({ index, filename, subfolder, deleted: false, error: item.error });
      continue;
    }
    try {
      await deleteFile(item.path);
      results.push({ index, filename, subfolder, deleted: true });
    } catch (cause) {
      results.push({
        index,
        filename,
        subfolder,
        deleted: false,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  const allDeleted = results.every((r) => r.deleted);
  return Response.json({ results }, { status: allDeleted ? 200 : 207 });
}

/**
 * Pull `filename`/`subfolder`/`type` out of one unvalidated batch entry.
 *
 * `subfolder` and `type` fall back the same way the single-file path does —
 * `type` defaulting to "output" is then re-verified by `outputFilePath()`,
 * same as the single-file path, so the two shapes agree on what's legal.
 */
function readBatchItem(raw: unknown): BatchDeleteRequestItem | { filename: string; error: string } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const filename = typeof obj.filename === "string" ? obj.filename : "";
  if (!filename) {
    return { filename: "(sin nombre)", error: "Falta decir qué archivo borrar." };
  }
  const subfolder = typeof obj.subfolder === "string" ? obj.subfolder : "";
  const type = typeof obj.type === "string" ? obj.type : "output";
  return { filename, subfolder, type };
}
