import { NextRequest } from "next/server";
import { submit } from "@/lib/tts";

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

  // A fresh seed per generation: asking again for the same text should give a
  // different take, because re-rolling a delivery is the whole point of the loop.
  const seed = typeof body?.seed === "number" ? body.seed : Math.floor(Math.random() * 2 ** 31);

  try {
    return Response.json({ promptId: await submit(text, voiceId, seed), seed });
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
