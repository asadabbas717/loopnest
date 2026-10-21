type Actor = { id: string; email: string };
type Dependencies = {
  actor: (token: string) => Promise<Actor | null>;
  reauthenticate: (actor: Actor, password: string) => Promise<boolean>;
  freeze: (id: string) => Promise<void>;
  paths: (id: string, offset: number) => Promise<string[]>;
  remove: (paths: string[]) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
};
const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ message, deleted: status === 200 }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export function accountErasureHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return reply(405, "Method not allowed.");
    if (request.headers.has("origin"))
      return reply(403, "Browser access is not supported.");
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
    if (!token) return reply(401, "Sign in again.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply(415, "JSON is required.");
    try {
      const actor = await deps.actor(token);
      if (!actor) return reply(401, "Sign in again.");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "Invalid request.");
      let body = "";
      let size = 0;
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          return reply(413, "Request too large.");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return reply(400, "Invalid request.");
      }
      if (
        !value ||
        typeof value !== "object" ||
        !("password" in value) ||
        !("confirmation" in value) ||
        Object.keys(value).some(
          (key) => !["password", "confirmation"].includes(key),
        ) ||
        typeof value.password !== "string" ||
        value.password.length < 1 ||
        value.password.length > 256 ||
        value.confirmation !== "DELETE"
      )
        return reply(400, "Confirm account deletion.");
      if (!(await deps.reauthenticate(actor, value.password)))
        return reply(403, "Password verification failed.");
      await deps.freeze(actor.id);
      // Paths remain stable until Auth deletion cascades metadata. Remove physical
      // objects through Storage, including peer-owned media in conversations erased.
      for (let page = 0; page < 100; page++) {
        const paths = await deps.paths(actor.id, page * 100);
        if (paths.length) await deps.remove(paths);
        if (paths.length < 100) {
          await deps.deleteUser(actor.id);
          return reply(200, "Account deleted.");
        }
      }
      return reply(
        503,
        "Deletion is pending. Retry or contact the project maintainer.",
      );
    } catch {
      return reply(
        503,
        "Deletion is pending or unavailable. Retry this request.",
      );
    }
  };
}
