/**
 * The bridge to ComfyUI. See directives/architecture/ADR-001-comfyui-bridge.md.
 *
 * ComfyUI refuses any request carrying a foreign `Origin` with a bare 403 —
 * measured, not assumed. The browser therefore never calls it; this module is
 * called from the server, and it must not pass the browser's own headers
 * through, or it reproduces the very 403 it exists to avoid.
 */

export const COMFY_BASE_URL = process.env.COMFY_URL ?? "http://127.0.0.1:8188";

/**
 * Headers that must never reach ComfyUI.
 *
 * `origin` and `referer` are what trigger the 403. `host` would address the
 * wrong server. `connection` and the `content-length` are hop-by-hop or
 * recomputed by fetch; forwarding them corrupts the request body.
 */
const STRIPPED = new Set([
  "origin",
  "referer",
  "host",
  "connection",
  "content-length",
  "accept-encoding",
]);

/**
 * Copy request headers, dropping the ones that must not cross.
 * Pure and synchronous on purpose: this is the part worth testing.
 */
export function sanitizeHeaders(incoming: Headers): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) out.append(key, value);
  });
  return out;
}

/** Join the proxy path segments onto the ComfyUI base, preserving the query. */
export function comfyUrl(segments: string[], search = ""): string {
  const path = segments.map(encodeURIComponent).join("/");
  return `${COMFY_BASE_URL}/${path}${search}`;
}

/** Server-side fetch against ComfyUI, with the offending headers removed. */
export async function comfyFetch(
  url: string,
  init: RequestInit & { headers?: Headers } = {},
): Promise<Response> {
  const headers = init.headers ? sanitizeHeaders(init.headers) : new Headers();
  return fetch(url, { ...init, headers, cache: "no-store" });
}
