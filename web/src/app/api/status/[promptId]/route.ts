import { NextRequest } from "next/server";
import { statusOf } from "@/lib/tts";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await ctx.params;
  try {
    return Response.json(await statusOf(promptId));
  } catch (cause) {
    return Response.json(
      {
        state: "failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}
