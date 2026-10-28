type Deps = {
  actor: (token: string) => Promise<string | null>;
  begin: (
    cid: string,
    actor: string,
    requestId: string,
  ) => Promise<{ job_id: string; done: boolean }>;
  paths: (id: string, offset: number) => Promise<string[]>;
  remove: (paths: string[]) => Promise<void>;
  finish: (id: string) => Promise<void>;
};
export function clearChatHandler(deps: Deps) {
  const reply = (status: number, code: string) =>
    Response.json(
      { code, cleared: status === 200 },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  return async (request: Request) => {
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
      if (!reader) return reply(400, "invalid_confirmation");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 512) {
            await reader.cancel();
            return reply(413, "invalid_confirmation");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      let body;
      try {
        body = JSON.parse(
          new TextDecoder().decode(
            await new Blob(chunks as BlobPart[]).arrayBuffer(),
          ),
        );
      } catch {
        return reply(400, "invalid_confirmation");
      }
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (
        !body ||
        Object.keys(body).some(
          (key) =>
            !["conversation_id", "request_id", "confirmation"].includes(key),
        ) ||
        typeof body.conversation_id !== "string" ||
        !uuid.test(body.conversation_id) ||
        typeof body.request_id !== "string" ||
        !uuid.test(body.request_id) ||
        body.confirmation !== "CLEAR"
      )
        return reply(400, "invalid_confirmation");
      const job = await deps.begin(
        body.conversation_id,
        actor,
        body.request_id,
      );
      if (job.done) return reply(200, "chat_cleared");
      for (let page = 0; page < 20; page++) {
        const paths = await deps.paths(job.job_id, page * 100);
        if (paths.length) await deps.remove(paths);
        if (paths.length < 100) {
          await deps.finish(job.job_id);
          return reply(200, "chat_cleared");
        }
      }
      return reply(503, "clear_unavailable");
    } catch (issue) {
      const error = issue as { code?: string; message?: string };
      if (error.code === "42501") return reply(403, "request_forbidden");
      if (error.message === "Clear limit reached")
        return reply(429, "rate_limited");
      return reply(503, "clear_unavailable");
    }
  };
}
