type Asset = { id: string; path: string };
type Counts = {
  photos: number;
  messages: number;
  avatars: number;
  deletions: number;
  metadata: number;
  failures: number;
};
export type MaintenanceDependencies = {
  backlog: () => Promise<Record<string, number>>;
  acquire: () => Promise<string | null>;
  finish: (id: string, success: boolean, counts: Counts) => Promise<void>;
  pendingDeletes: () => Promise<{ message_id: string; path: string | null }[]>;
  finishDelete: (id: string) => Promise<void>;
  photos: () => Promise<Asset[]>;
  finishPhotos: (ids: string[]) => Promise<number>;
  avatars: () => Promise<Asset[]>;
  finishAvatars: (ids: string[]) => Promise<void>;
  remove: (
    bucket: "chat-photos" | "profile-photos",
    paths: string[],
  ) => Promise<void>;
  purgeText: () => Promise<number>;
  prune: () => Promise<number>;
};
export async function runContentMaintenance(
  deps: MaintenanceDependencies,
  dryRun = true,
) {
  if (dryRun) return { dryRun: true, backlog: await deps.backlog() };
  const lease = await deps.acquire();
  if (!lease) return { dryRun: false, skipped: true };
  const counts: Counts = {
    photos: 0,
    messages: 0,
    avatars: 0,
    deletions: 0,
    metadata: 0,
    failures: 0,
  };
  const deadline = performance.now() + 90000;
  async function attempt<T>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      if (performance.now() > deadline) throw new Error("Maintenance deadline");
      return await operation();
    } catch {
      counts.failures++;
      return undefined;
    }
  }
  await attempt(async () => {
    const jobs = await deps.pendingDeletes();
    if (jobs.length > 20) throw new Error("Invalid batch");
    for (const job of jobs)
      await attempt(async () => {
        if (job.path) await deps.remove("chat-photos", [job.path]);
        await deps.finishDelete(job.message_id);
        counts.deletions++;
      });
  });
  await attempt(async () => {
    const assets = await deps.photos();
    if (assets.length > 100) throw new Error("Invalid batch");
    if (assets.length) {
      await deps.remove(
        "chat-photos",
        assets.map((a) => a.path),
      );
      counts.photos = await deps.finishPhotos(assets.map((a) => a.id));
    }
  });
  await attempt(async () => {
    const assets = await deps.avatars();
    if (assets.length > 20) throw new Error("Invalid batch");
    if (assets.length) {
      await deps.remove(
        "profile-photos",
        assets.map((a) => a.path),
      );
      await deps.finishAvatars(assets.map((a) => a.id));
      counts.avatars = assets.length;
    }
  });
  await attempt(async () => {
    counts.messages = await deps.purgeText();
  });
  await attempt(async () => {
    counts.metadata = await deps.prune();
  });
  await deps.finish(lease, counts.failures === 0, counts);
  return { dryRun: false, skipped: false, counts };
}
async function matchesToken(value: string | null, expected: string) {
  if (
    !value ||
    !/^([a-f0-9]{64})$/.test(value) ||
    !/^([a-f0-9]{64})$/.test(expected)
  )
    return false;
  const hashes = await Promise.all(
    [value, expected].map((s) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  );
  const left = new Uint8Array(hashes[0]!),
    right = new Uint8Array(hashes[1]!);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}
export function contentMaintenanceHandler(
  deps: MaintenanceDependencies,
  token: string,
) {
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST" || request.headers.has("origin"))
      return reply(403, { code: "request_forbidden" });
    if (
      !(await matchesToken(request.headers.get("x-maintenance-token"), token))
    )
      return reply(401, { code: "auth_required" });
    try {
      const reader = request.body?.getReader();
      let raw = "";
      if (reader) {
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 128) {
              await reader.cancel();
              return reply(413, { code: "invalid_request" });
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
        raw = await new Blob(chunks as BlobPart[]).text();
      }
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return reply(400, { code: "invalid_request" });
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => k !== "dry_run") ||
        (body.dry_run !== undefined && typeof body.dry_run !== "boolean")
      )
        return reply(400, { code: "invalid_request" });
      const result = await runContentMaintenance(deps, body.dry_run !== false);
      return reply(
        "counts" in result && result.counts && result.counts.failures > 0
          ? 503
          : 200,
        result,
      );
    } catch {
      return reply(503, { code: "maintenance_unavailable" });
    }
  };
}
