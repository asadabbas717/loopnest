type Dependencies = {
  actor: (token: string) => Promise<string | null>;
  claim: (
    actor: string,
    id: string,
  ) => Promise<{
    path: string;
    expires_at: string | null;
    server_time: string;
  } | null>;
  read: (path: string) => Promise<Uint8Array>;
};
export function openPhotoHandler(deps: Dependencies) {
  const failure = (status: number, code: string) =>
    Response.json(
      { code },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST" || request.headers.has("Origin"))
      return failure(403, "request_forbidden");
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
    if (!token) return failure(401, "auth_required");
    let actor: string | null;
    try {
      actor = await deps.actor(token);
    } catch {
      return failure(503, "photo_delivery_unavailable");
    }
    if (!actor) return failure(401, "auth_required");
    try {
      const reader = request.body?.getReader();
      if (!reader) return failure(400, "invalid_photo");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > 512) {
            await reader.cancel();
            return failure(413, "invalid_photo");
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let body: { asset_id?: unknown };
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return failure(400, "invalid_photo");
      }
      if (
        !body ||
        typeof body.asset_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.asset_id,
        )
      )
        return failure(400, "invalid_photo");
      const claimStarted = performance.now();
      const asset = await deps.claim(actor, body.asset_id);
      if (!asset) return failure(404, "photo_unavailable");
      const image = await deps.read(asset.path);
      const remaining = Math.floor(
        Math.min(
          60000,
          asset.expires_at
            ? Date.parse(asset.expires_at) - Date.parse(asset.server_time)
            : 60000,
        ) -
          (performance.now() - claimStarted),
      );
      if (!Number.isFinite(remaining) || remaining <= 0)
        return failure(404, "photo_unavailable");
      if (!image.length || image.length > 1048576)
        return failure(503, "photo_delivery_unavailable");
      return new Response(Uint8Array.from(image).buffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "X-Photo-View-Ms": String(remaining),
        },
      });
    } catch {
      return failure(503, "photo_delivery_unavailable");
    }
  };
}
