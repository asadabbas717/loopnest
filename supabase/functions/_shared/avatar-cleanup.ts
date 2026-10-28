type Result = { data: unknown; error: unknown };
type AvatarAdmin = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<Result> & {
    range: (from: number, to: number) => PromiseLike<Result>;
  };
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ error: unknown }>;
    };
  };
};
export async function cleanRetiredAvatars(
  admin: AvatarAdmin,
  actor: string,
  erasing = false,
) {
  for (let page = 0; page < 100; page++) {
    const offset = erasing ? page * 20 : 0;
    const { data, error } = await admin
      .rpc("avatar_cleanup_paths", { actor, erasing })
      .range(offset, offset + 19);
    if (error) throw new Error("Avatar cleanup unavailable");
    const rows = data as { id: string; path: string }[];
    if (rows.length) {
      const removed = await admin.storage
        .from("profile-photos")
        .remove(rows.map((row) => row.path));
      if (removed.error) throw new Error("Avatar cleanup pending");
      if (!erasing) {
        const result = await admin.rpc("finish_avatar_cleanup", {
          asset_ids: rows.map((row) => row.id),
        });
        if (result.error) throw new Error("Avatar cleanup pending");
      }
    }
    if (rows.length < 20) return;
  }
  throw new Error("Avatar cleanup bound reached");
}
