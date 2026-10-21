import { maxPhotoBytes } from "./photo-codec.ts";
type Asset = { id: string; path: string };
type Dependencies = {
  actor: (token: string) => Promise<string | null>;
  claim: (actor: string, id: string) => Promise<Asset | null>;
  sanitize: (bytes: Uint8Array) => Uint8Array;
  store: (asset: Asset, bytes: Uint8Array, actor: string) => Promise<void>;
};
const reply = (status: number, code: string, assetId?: string) =>
  new Response(JSON.stringify({ code, ...(assetId ? { assetId } : {}) }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export function photoUploadHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return reply(405, "request_forbidden");
    if (request.headers.has("origin")) return reply(403, "request_forbidden");
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
    if (!token) return reply(401, "auth_required");
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "image/jpeg"
    )
      return reply(415, "invalid_photo");
    const id = request.headers.get("x-photo-id") ?? "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return reply(400, "invalid_photo");
    try {
      const actor = await deps.actor(token);
      if (!actor) return reply(401, "auth_required");
      // A one-use claim consumes an existing, rate-limited reservation before
      // reading/decoding input. Repeated invalid requests cannot reuse one slot.
      const asset = await deps.claim(actor, id);
      if (!asset) return reply(403, "photo_unavailable");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "invalid_photo");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxPhotoBytes) {
          await reader.cancel();
          return reply(413, "invalid_photo");
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let output: Uint8Array;
      try {
        output = deps.sanitize(bytes);
      } catch {
        return reply(422, "invalid_photo");
      }
      await deps.store(asset, output, actor);
      return reply(200, "photo_uploaded", asset.id);
    } catch {
      return reply(503, "photo_upload_unavailable");
    }
  };
}
