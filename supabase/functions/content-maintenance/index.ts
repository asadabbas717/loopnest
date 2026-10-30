import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { contentMaintenanceHandler } from "../_shared/content-maintenance.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  },
);
async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error("Maintenance operation failed");
  return data as T;
}
Deno.serve(
  contentMaintenanceHandler(
    {
      backlog: () => rpc("content_maintenance_backlog"),
      acquire: () => rpc("begin_content_maintenance"),
      finish: (id, success, counts) =>
        rpc("finish_content_maintenance", {
          rid: id,
          successful: success,
          summary: counts,
        }),
      pendingDeletes: () =>
        rpc("pending_message_delete_work", { batch_size: 20 }),
      finishDelete: (mid) => rpc("finish_message_delete", { mid }),
      photos: () => rpc("claim_photo_cleanup", { batch_size: 100 }),
      finishPhotos: (asset_ids) => rpc("finish_photo_cleanup", { asset_ids }),
      avatars: () => rpc("claim_avatar_maintenance", { batch_size: 20 }),
      finishAvatars: (asset_ids) => rpc("finish_avatar_cleanup", { asset_ids }),
      async remove(bucket, paths) {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (error) throw new Error("Storage unavailable");
      },
      purgeText: () => rpc("purge_expired_messages", { batch_size: 500 }),
      prune: () => rpc("prune_content_metadata"),
    },
    Deno.env.get("LOOPNEST_MAINTENANCE_TOKEN") ?? "",
  ),
);
