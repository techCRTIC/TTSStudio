import { NextRequest } from "next/server";
import { comfyFetch, comfyUrl } from "@/lib/comfy";

/**
 * Transparent proxy to ComfyUI. Every engine call in the app goes through here
 * so that exactly one place is responsible for not leaking `Origin` (ADR-001).
 */

export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, segments: string[]): Promise<Response> {
  const url = comfyUrl(segments, req.nextUrl.search);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  try {
    const upstream = await comfyFetch(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (cause) {
    // ComfyUI not running is the common case, and it deserves a real message
    // rather than an opaque 500 the UI has to guess at.
    return Response.json(
      {
        error: "comfy_unreachable",
        message: `No se pudo alcanzar ComfyUI en ${url}. ¿Está corriendo?`,
        cause: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
