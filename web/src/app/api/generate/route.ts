import { NextRequest } from "next/server";
import {
  LANGUAGES,
  normalizeSeed,
  normalizeTokens,
  randomSeed,
  submit,
  TOKENS_DEFAULT,
  type Language,
  type VoiceKind,
} from "@/lib/tts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : "";

  if (!text) {
    return Response.json({ error: "empty_text", message: "No hay texto que decir." }, { status: 400 });
  }
  if (!voiceId) {
    return Response.json({ error: "no_voice", message: "Falta elegir una voz." }, { status: 400 });
  }

  // A fresh seed per generation unless one is pinned: asking again for the same
  // text should give a different take, because re-rolling a delivery is the
  // whole point of the loop. A pinned seed is how the user opts out of that.
  const seed = body?.seed === undefined || body?.seed === null ? randomSeed() : normalizeSeed(body.seed);

  // The client is not trusted with engine bounds: an out-of-range value here
  // is a graph ComfyUI rejects, so both are clamped to what the node accepts.
  const language: Language = LANGUAGES.includes(body?.language) ? body.language : "Spanish";
  const maxNewTokens = normalizeTokens(body?.maxNewTokens ?? TOKENS_DEFAULT);

  // Which node says this voice. Anything the client did not explicitly mark as
  // a preset is treated as a clone — the path that has always run — so an old
  // caller keeps working unchanged.
  const kind: VoiceKind = body?.kind === "preset" ? "preset" : "cloned";

  // A delivery instruction only exists on the preset node. Accepting it on the
  // clone path and quietly dropping it would let the interface imply a lever
  // the engine does not have there, which PRODUCT.md's second principle
  // forbids; refusing it out loud is the honest version.
  const instruct = typeof body?.instruct === "string" ? body.instruct.trim() : "";
  if (instruct && kind !== "preset") {
    return Response.json(
      {
        error: "instruct_not_supported",
        message: "La intención solo existe en las voces del modelo, no en una voz clonada.",
      },
      { status: 400 },
    );
  }

  try {
    const promptId = await submit(
      text,
      voiceId,
      seed,
      { language, maxNewTokens, ...(instruct ? { instruct } : {}) },
      kind,
    );
    // The effective values go back, not the requested ones — the take records
    // what actually ran, so replaying it reproduces it.
    return Response.json({ promptId, seed, language, maxNewTokens, kind });
  } catch (cause) {
    return Response.json(
      {
        error: "submit_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}
