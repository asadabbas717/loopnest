type Dependencies = {
  actor: (token: string) => Promise<string | null>;
  begin: (
    cid: string,
    mid: string,
    actor: string,
  ) => Promise<{ done: boolean; path: string | null }>;
  remove: (path: string) => Promise<void>;
  finish: (mid: string) => Promise<void>;
};
export function deleteMessageHandler(deps: Dependencies) {
  const reply = (status: number, code: string) =>
    Response.json(
      { code, deleted: status === 200 },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST" || request.headers.has("origin"))
      return reply(403, "request_forbidden");
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
    if (!token) return reply(401, "auth_required");
    try {
      const actor = await deps.actor(token);
      if (!actor) return reply(401, "auth_required");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "message_delete_invalid");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 512) {
            await reader.cancel();
            return reply(413, "message_delete_invalid");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      let body;
      try {
        body = JSON.parse(await new Blob(chunks as BlobPart[]).text());
      } catch {
        return reply(400, "message_delete_invalid");
      }
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (
        !body ||
        Object.keys(body).some(
          (key) =>
            !["conversation_id", "message_id", "confirmation"].includes(key),
        ) ||
        typeof body.conversation_id !== "string" ||
        !uuid.test(body.conversation_id) ||
        typeof body.message_id !== "string" ||
        !uuid.test(body.message_id) ||
        body.confirmation !== "DELETE"
      )
        return reply(400, "message_delete_invalid");
      const job = await deps.begin(
        body.conversation_id,
        body.message_id,
        actor,
      );
      if (!job.done) {
        if (job.path) await deps.remove(job.path);
        await deps.finish(body.message_id);
      }
      return reply(200, "message_deleted");
    } catch (issue) {
      if ((issue as { code?: string })?.code === "42501")
        return reply(403, "message_delete_forbidden");
      return reply(503, "message_delete_unavailable");
    }
  };
}
